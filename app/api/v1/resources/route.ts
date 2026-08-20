import {
  apiError,
  ensureDatabase,
  getSessionUser,
  platformEnv,
  randomId,
  resolveVtcId,
  requireFounder,
  requireVtcPermission,
} from "@/lib/platform";
type Body = {
  action?: string;
  vtcId?: string;
  id?: string;
  data?: Record<string, unknown>;
};
const clean = (v: unknown, n = 12000) =>
    String(v ?? "")
      .trim()
      .slice(0, n),
  list = (v: unknown) =>
    Array.isArray(v)
      ? v
      : String(v ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
export async function GET(request: Request) {
  await ensureDatabase();
  const db = platformEnv().DB,
    url = new URL(request.url),
    requested = url.searchParams.get("vtcId"),
    vtcId = (await resolveVtcId(request, requested)) ?? "",
    user = await getSessionUser(request),
    member = user
      ? await db
          .prepare(`SELECT id FROM memberships WHERE vtc_id=? AND user_id=?`)
          .bind(vtcId, user.id)
          .first()
      : null;
  if (url.searchParams.get("download")) {
    const id = url.searchParams.get("download")!,
      row = await db
        .prepare(
          `SELECT external_url AS url FROM downloads WHERE id=? AND approved=1`,
        )
        .bind(id)
        .first<any>();
    if (!row) return apiError("Download nicht gefunden", 404);
    await db
      .prepare(
        `UPDATE downloads SET download_count=download_count+1 WHERE id=?`,
      )
      .bind(id)
      .run();
    return Response.redirect(row.url, 302);
  }
  const [downloads, versions, articles, courses, progress] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM downloads WHERE approved=1 AND (vtc_id IS NULL OR vtc_id=?) ORDER BY type,created_at DESC`,
      )
      .bind(vtcId)
      .all(),
    db
      .prepare(
        `SELECT * FROM client_versions ORDER BY product,channel,published_at DESC`,
      )
      .all(),
    db
      .prepare(
        `SELECT a.*,u.display_name AS author,(SELECT acknowledged_at FROM article_acknowledgements k WHERE k.article_id=a.id AND k.user_id=? AND k.version=a.version) acknowledgedAt FROM knowledge_articles a JOIN users u ON u.id=a.author_id WHERE a.published=1 AND (a.vtc_id IS NULL OR a.vtc_id=?) AND (a.visibility='public' OR ?=1) ORDER BY a.category,a.title`,
      )
      .bind(user?.id ?? "", vtcId, member ? 1 : 0)
      .all(),
    db
      .prepare(
        `SELECT * FROM training_courses WHERE published=1 AND (vtc_id IS NULL OR vtc_id=?) ORDER BY category,title`,
      )
      .bind(vtcId)
      .all(),
    user
      ? db
          .prepare(`SELECT * FROM training_progress WHERE user_id=?`)
          .bind(user.id)
          .all()
      : Promise.resolve({ results: [] } as any),
  ]);
  return Response.json({
    user: user ? { id: user.id } : null,
    canManage: Boolean(
      await requireVtcPermission(request, vtcId, "manage_training"),
    ),
    downloads: (downloads.results as any[]).map((x) => ({
      ...x,
      dependencies: parse(x.dependencies, []),
      dlc_requirements: parse(x.dlc_requirements, []),
      game_versions: parse(x.game_versions, []),
    })),
    versions: (versions.results as any[]).map((x) => ({
      ...x,
      compatibility: parse(x.compatibility, {}),
    })),
    articles: articles.results,
    courses: (courses.results as any[]).map((x) => ({
      ...x,
      content: parse(x.content, []),
      questions: parse(x.questions, []).map((q: any) => ({
        ...q,
        answer: undefined,
      })),
    })),
    progress: progress.results,
  });
}
export async function POST(request: Request) {
  await ensureDatabase();
  const b = (await request.json()) as Body,
    db = platformEnv().DB,
    user = await getSessionUser(request),
    d = b.data ?? {};
  if (!user) return apiError("Anmeldung erforderlich", 401);
  if (b.action === "ack" && b.id) {
    const a = await db
      .prepare(
        `SELECT id,version FROM knowledge_articles WHERE id=? AND published=1`,
      )
      .bind(b.id)
      .first<any>();
    if (!a) return apiError("Artikel nicht gefunden", 404);
    await db
      .prepare(
        `INSERT OR IGNORE INTO article_acknowledgements (id,article_id,user_id,version) VALUES (?,?,?,?)`,
      )
      .bind(randomId(), a.id, user.id, a.version)
      .run();
    return Response.json({ saved: true });
  }
  if (b.action === "progress" && b.id) {
    const course = await db
      .prepare(
        `SELECT id,questions,passing_score FROM training_courses WHERE id=? AND published=1`,
      )
      .bind(b.id)
      .first<any>();
    if (!course) return apiError("Kurs nicht gefunden", 404);
    let score: Number | undefined,
      status = "started",
      completed = null;
    if (Array.isArray(d.answers)) {
      const qs = parse(course.questions, []),
        answers = d.answers as unknown[],
        correct = qs.filter(
          (q: any, i: number) => Number(q.answer) === Number(answers[i]),
        ).length;
      score = Math.round((correct / Math.max(1, qs.length)) * 100);
      status = Number(score) >= course.passing_score ? "completed" : "failed";
      completed = status === "completed" ? new Date().toISOString() : null;
    }
    await db
      .prepare(
        `INSERT INTO training_progress (id,course_id,user_id,progress,score,status,completed_at,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(course_id,user_id) DO UPDATE SET progress=excluded.progress,score=excluded.score,status=excluded.status,completed_at=excluded.completed_at,updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(
        randomId(),
        course.id,
        user.id,
        Math.max(0, Math.min(100, Number(d.progress) || 0)),
        score ?? null,
        status,
        completed,
      )
      .run();
    return Response.json({ saved: true, score, status });
  }
  const vtcId = await resolveVtcId(request, b.vtcId);
  if (!vtcId) return apiError("Keine eigene Spedition gefunden", 403);
  const actor = await requireVtcPermission(request, vtcId, "manage_training");
  if (!actor) return apiError("Schulungsrecht erforderlich", 403);
  if (b.action === "article") {
    const id = b.id || randomId(),
      slug = clean(d.slug, 100)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
    await db
      .prepare(
        `INSERT INTO knowledge_articles (id,vtc_id,slug,title,category,body,visibility,version,requires_acknowledgement,published,author_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,category=excluded.category,body=excluded.body,visibility=excluded.visibility,version=knowledge_articles.version+1,requires_acknowledgement=excluded.requires_acknowledgement,published=excluded.published,updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(
        id,
        vtcId,
        slug,
        clean(d.title, 180),
        clean(d.category, 100),
        clean(d.body),
        clean(d.visibility, 30) || "internal",
        1,
        d.requiresAcknowledgement ? 1 : 0,
        d.published ? 1 : 0,
        actor.id,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "course") {
    const id = b.id || randomId();
    await db
      .prepare(
        `INSERT INTO training_courses (id,vtc_id,title,description,category,content,questions,passing_score,certificate_name,published,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,content=excluded.content,questions=excluded.questions,passing_score=excluded.passing_score,certificate_name=excluded.certificate_name,published=excluded.published`,
      )
      .bind(
        id,
        vtcId,
        clean(d.title, 180),
        clean(d.description, 2000) || null,
        clean(d.category, 100),
        JSON.stringify(list(d.content)),
        clean(d.questions) || "[]",
        Math.max(1, Math.min(100, Number(d.passingScore) || 80)),
        clean(d.certificateName, 160) || null,
        d.published ? 1 : 0,
        actor.id,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "download") {
    const id = b.id || randomId(),
      founder = await requireFounder(request);
    await db
      .prepare(
        `INSERT INTO downloads (id,vtc_id,title,type,description,upload_id,external_url,version,dependencies,dlc_requirements,game_versions,checksum,approved,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,type=excluded.type,description=excluded.description,upload_id=excluded.upload_id,external_url=excluded.external_url,version=excluded.version,dependencies=excluded.dependencies,dlc_requirements=excluded.dlc_requirements,game_versions=excluded.game_versions,checksum=excluded.checksum,approved=excluded.approved`,
      )
      .bind(
        id,
        vtcId,
        clean(d.title, 180),
        clean(d.type, 60),
        clean(d.description, 2000) || null,
        clean(d.uploadId, 100) || null,
        clean(d.externalUrl, 1000) || null,
        clean(d.version, 40) || null,
        JSON.stringify(list(d.dependencies)),
        JSON.stringify(list(d.dlcRequirements)),
        JSON.stringify(list(d.gameVersions)),
        clean(d.checksum, 200) || null,
        founder ? 1 : 0,
        actor.id,
      )
      .run();
    return Response.json({ saved: true, id, pendingApproval: !founder });
  }
  return apiError("Ungültige Ressourcenaktion");
}
const parse = (v: unknown, f: any) => {
  try {
    return JSON.parse(String(v));
  } catch {
    return f;
  }
};

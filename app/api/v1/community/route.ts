import {
  apiError,
  audit,
  ensureDatabase,
  getSessionUser,
  platformEnv,
  randomId,
  requireVtcPermission,
} from "@/lib/platform";
type Body = {
  action?: string;
  vtcId?: string;
  id?: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
};
const clean = (v: unknown, n = 5000) =>
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
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const db = platformEnv().DB,
    url = new URL(request.url),
    vtcId = (await resolveVtcId(request,url.searchParams.get("vtcId"))) ?? "",
    member = await db
      .prepare(
        `SELECT id FROM memberships WHERE vtc_id=? AND user_id=? AND status IN ('active','probation')`,
      )
      .bind(vtcId, user.id)
      .first();
  if (!member) return apiError("Keine Mitgliedschaft", 403);
  const [
    news,
    board,
    comments,
    reactions,
    conversations,
    messages,
    partners,
    tasks,
    vtcs,
    drivers,
    departments,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT n.*,u.display_name AS author FROM news_posts n JOIN users u ON u.id=n.author_id WHERE n.vtc_id=? AND n.status!='archived' AND (n.status='published' OR n.author_id=?) ORDER BY n.pinned DESC,COALESCE(n.published_at,n.publish_at,n.created_at) DESC`,
      )
      .bind(vtcId, user.id)
      .all(),
    db
      .prepare(
        `SELECT b.*,u.display_name AS author FROM board_posts b JOIN users u ON u.id=b.author_id WHERE (b.vtc_id=? OR b.vtc_id IS NULL) AND b.status='published' AND (b.expires_at IS NULL OR b.expires_at>CURRENT_TIMESTAMP) ORDER BY b.pinned DESC,b.created_at DESC`,
      )
      .bind(vtcId)
      .all(),
    db
      .prepare(
        `SELECT c.*,u.display_name AS author FROM content_comments c JOIN users u ON u.id=c.author_id WHERE c.status='published' ORDER BY c.created_at`,
      )
      .all(),
    db
      .prepare(
        `SELECT entity_type,entity_id,reaction,COUNT(*) count FROM content_reactions GROUP BY entity_type,entity_id,reaction`,
      )
      .all(),
    db
      .prepare(
        `SELECT c.*,GROUP_CONCAT(u.display_name,', ') members FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id JOIN users u ON u.id=cm.user_id WHERE c.id IN (SELECT conversation_id FROM conversation_members WHERE user_id=?) GROUP BY c.id ORDER BY c.created_at DESC`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT m.*,u.display_name AS author FROM messages m JOIN users u ON u.id=m.author_id WHERE m.conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id=?) ORDER BY m.created_at`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT p.*,f.name AS from_name,t.name AS to_name FROM partnerships p JOIN vtcs f ON f.id=p.from_vtc_id JOIN vtcs t ON t.id=p.to_vtc_id WHERE p.from_vtc_id=? OR p.to_vtc_id=? ORDER BY p.updated_at DESC`,
      )
      .bind(vtcId, vtcId)
      .all(),
    db
      .prepare(
        `SELECT t.*,u.display_name AS assignee,d.name AS department FROM team_tasks t LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN departments d ON d.id=t.department_id WHERE t.vtc_id=? ORDER BY t.status='open' DESC,t.due_at`,
      )
      .bind(vtcId)
      .all(),
    db
      .prepare(`SELECT id,name,tag FROM vtcs WHERE id!=? ORDER BY name`)
      .bind(vtcId)
      .all(),
    db
      .prepare(
        `SELECT u.id,u.display_name AS name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.vtc_id=? AND m.status IN ('active','probation') ORDER BY u.display_name`,
      )
      .bind(vtcId)
      .all(),
    db
      .prepare(`SELECT id,name FROM departments WHERE vtc_id=? ORDER BY name`)
      .bind(vtcId)
      .all(),
  ]);
  return Response.json({
    user: { id: user.id },
    rights: {
      publishNews: Boolean(
        await requireVtcPermission(request, vtcId, "publish_news"),
      ),
      managePartnerships: Boolean(
        await requireVtcPermission(request, vtcId, "manage_partnerships"),
      ),
      manageTasks: Boolean(
        await requireVtcPermission(request, vtcId, "view_management"),
      ),
      moderate: Boolean(
        await requireVtcPermission(request, vtcId, "manage_gallery"),
      ),
    },
    news: news.results,
    board: board.results,
    comments: comments.results,
    reactions: reactions.results,
    conversations: conversations.results,
    messages: messages.results,
    partners: partners.results,
    tasks: (tasks.results as any[]).map((t) => ({
      ...t,
      checklist: parse(t.checklist, []),
    })),
    vtcs: vtcs.results,
    drivers: drivers.results,
    departments: departments.results,
  });
}
export async function POST(request: Request) {
  await ensureDatabase();
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const b = (await request.json()) as Body,
    db = platformEnv().DB,
    vtcId = (await resolveVtcId(request,b.vtcId)) ?? "",
    d = b.data ?? {};
  if (b.action === "news") {
    const actor = await requireVtcPermission(request, vtcId, "publish_news");
    if (!actor) return apiError("Newsrecht erforderlich", 403);
    const id = b.id || randomId(),
      status = clean(d.status, 20) || "draft";
    await db
      .prepare(
        `INSERT INTO news_posts (id,vtc_id,author_id,title,body,category,visibility,status,pinned,cover_upload_id,publish_at,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,category=excluded.category,visibility=excluded.visibility,status=excluded.status,pinned=excluded.pinned,cover_upload_id=excluded.cover_upload_id,publish_at=excluded.publish_at,published_at=CASE WHEN excluded.status='published' THEN COALESCE(news_posts.published_at,CURRENT_TIMESTAMP) ELSE news_posts.published_at END`,
      )
      .bind(
        id,
        vtcId,
        user.id,
        clean(d.title, 180),
        clean(d.body, 10000),
        clean(d.category, 80) || "Allgemein",
        clean(d.visibility, 30) || "public",
        status,
        d.pinned ? 1 : 0,
        clean(d.coverUploadId, 100) || null,
        clean(d.publishAt, 30) || null,
        status,
      )
      .run();
    await audit("news.saved", "news", id, user.id, { status }, vtcId);
    return Response.json({ saved: true, id });
  }
  if (b.action === "board") {
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO board_posts (id,vtc_id,author_id,type,title,body,status,pinned,expires_at) VALUES (?,?,?,?,?,?,'published',?,?)`,
      )
      .bind(
        id,
        vtcId,
        user.id,
        clean(d.type, 50) || "post",
        clean(d.title, 180),
        clean(d.body, 7000),
        d.pinned && (await requireVtcPermission(request, vtcId, "publish_news"))
          ? 1
          : 0,
        clean(d.expiresAt, 30) || null,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "comment" && b.entityType && b.entityId) {
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO content_comments (id,entity_type,entity_id,author_id,body) VALUES (?,?,?,?,?)`,
      )
      .bind(
        id,
        clean(b.entityType, 30),
        clean(b.entityId, 100),
        user.id,
        clean(d.body, 2000),
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "reaction" && b.entityType && b.entityId) {
    const reaction = clean(d.reaction, 20) || "like",
      found = await db
        .prepare(
          `SELECT id FROM content_reactions WHERE entity_type=? AND entity_id=? AND user_id=? AND reaction=?`,
        )
        .bind(b.entityType, b.entityId, user.id, reaction)
        .first<any>();
    if (found)
      await db
        .prepare(`DELETE FROM content_reactions WHERE id=?`)
        .bind(found.id)
        .run();
    else
      await db
        .prepare(
          `INSERT INTO content_reactions (id,entity_type,entity_id,user_id,reaction) VALUES (?,?,?,?,?)`,
        )
        .bind(randomId(), b.entityType, b.entityId, user.id, reaction)
        .run();
    return Response.json({ saved: true, active: !found });
  }
  if (b.action === "conversation") {
    const ids = [user.id, ...list(d.memberIds)].filter(
        (x, i, a) => a.indexOf(x) === i,
      ),
      id = randomId();
    await db
      .prepare(
        `INSERT INTO conversations (id,vtc_id,type,title,department_id,created_by) VALUES (?,?,?,?,?,?)`,
      )
      .bind(
        id,
        vtcId,
        clean(d.type, 30) || "direct",
        clean(d.title, 160) || null,
        clean(d.departmentId, 100) || null,
        user.id,
      )
      .run();
    await db.batch(
      ids.map((uid) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO conversation_members (id,conversation_id,user_id) VALUES (?,?,?)`,
          )
          .bind(randomId(), id, uid),
      ),
    );
    return Response.json({ saved: true, id });
  }
  if (b.action === "message" && b.id) {
    if (
      !(await db
        .prepare(
          `SELECT id FROM conversation_members WHERE conversation_id=? AND user_id=?`,
        )
        .bind(b.id, user.id)
        .first())
    )
      return apiError("Kein Zugriff auf Unterhaltung", 403);
    const id = randomId();
    await db.batch([
      db
        .prepare(
          `INSERT INTO messages (id,conversation_id,author_id,body,attachment_upload_id) VALUES (?,?,?,?,?)`,
        )
        .bind(
          id,
          b.id,
          user.id,
          clean(d.body, 5000),
          clean(d.attachmentUploadId, 100) || null,
        ),
      db
        .prepare(
          `UPDATE conversation_members SET last_read_at=CURRENT_TIMESTAMP WHERE conversation_id=? AND user_id=?`,
        )
        .bind(b.id, user.id),
    ]);
    return Response.json({ saved: true, id });
  }
  if (b.action === "partnership") {
    const actor = await requireVtcPermission(
      request,
      vtcId,
      "manage_partnerships",
    );
    if (!actor) return apiError("Partnerschaftsrecht erforderlich", 403);
    const to = clean(d.toVtcId, 100);
    if (!to || to === vtcId) return apiError("Partner-Spedition erforderlich");
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO partnerships (id,from_vtc_id,to_vtc_id,status,contact_name,agreement,internal_notes,starts_at,ends_at,created_by) VALUES (?,?,?,'requested',?,?,?,?,?,?) ON CONFLICT(from_vtc_id,to_vtc_id) DO UPDATE SET status='requested',contact_name=excluded.contact_name,agreement=excluded.agreement,internal_notes=excluded.internal_notes,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(
        id,
        vtcId,
        to,
        clean(d.contactName, 120) || null,
        clean(d.agreement, 5000) || null,
        clean(d.internalNotes, 3000) || null,
        clean(d.startsAt, 30) || null,
        clean(d.endsAt, 30) || null,
        actor.id,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "partnershipStatus" && b.id) {
    const actor = await requireVtcPermission(
      request,
      vtcId,
      "manage_partnerships",
    );
    if (!actor) return apiError("Partnerschaftsrecht erforderlich", 403);
    const status = clean(d.status, 20);
    if (!["active", "rejected", "ended", "blocked"].includes(status))
      return apiError("Ungültiger Status");
    await db
      .prepare(
        `UPDATE partnerships SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND (from_vtc_id=? OR to_vtc_id=?)`,
      )
      .bind(status, b.id, vtcId, vtcId)
      .run();
    return Response.json({ saved: true });
  }
  if (b.action === "task") {
    const actor = await requireVtcPermission(request, vtcId, "view_management");
    if (!actor) return apiError("Verwaltungsrecht erforderlich", 403);
    const id = b.id || randomId();
    await db
      .prepare(
        `INSERT INTO team_tasks (id,vtc_id,title,description,assigned_to,department_id,priority,status,due_at,checklist,recurrence,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,assigned_to=excluded.assigned_to,department_id=excluded.department_id,priority=excluded.priority,status=excluded.status,due_at=excluded.due_at,checklist=excluded.checklist,recurrence=excluded.recurrence`,
      )
      .bind(
        id,
        vtcId,
        clean(d.title, 180),
        clean(d.description, 3000) || null,
        clean(d.assignedTo, 100) || null,
        clean(d.departmentId, 100) || null,
        clean(d.priority, 20) || "normal",
        clean(d.status, 20) || "open",
        clean(d.dueAt, 30) || null,
        JSON.stringify(list(d.checklist)),
        clean(d.recurrence, 100) || null,
        actor.id,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "taskStatus" && b.id) {
    await db
      .prepare(
        `UPDATE team_tasks SET status=? WHERE id=? AND vtc_id=? AND (assigned_to=? OR created_by=?)`,
      )
      .bind(clean(d.status, 20), b.id, vtcId, user.id, user.id)
      .run();
    return Response.json({ saved: true });
  }
  return apiError("Ungültige Community-Aktion");
}
const parse = (v: unknown, f: any) => {
  try {
    return JSON.parse(String(v));
  } catch {
    return f;
  }
};
import {resolveVtcId} from "@/lib/platform";

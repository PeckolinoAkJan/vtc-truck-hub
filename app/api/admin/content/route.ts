import { apiError, audit, ensureDatabase, platformEnv, randomId, requireFounder } from "@/lib/platform";

const text = (value: unknown, max = 12000) => String(value ?? "").trim().slice(0, max);
const slugify = (value: unknown) => text(value, 100).toLowerCase().replace(/[^a-z0-9äöüß-]+/g, "-").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/-+/g, "-").replace(/^-|-$/g, "");
const allowedStatus = (value: unknown) => ["draft", "published", "archived"].includes(String(value)) ? String(value) : "draft";

export async function GET(request: Request) {
  await ensureDatabase();
  const founder = await requireFounder(request);
  if (!founder) return apiError("Nur das Gründerkonto darf öffentliche Inhalte verwalten", 403);
  const db = platformEnv().DB;
  const [news, wiki] = await Promise.all([
    db.prepare(`SELECT id,slug,title,teaser,body,category,cover_url AS coverUrl,status,pinned,publish_at AS publishAt,published_at AS publishedAt,created_at AS createdAt,updated_at AS updatedAt FROM platform_news ORDER BY status='published' DESC,pinned DESC,updated_at DESC`).all(),
    db.prepare(`SELECT id,slug,title,summary,body,position,status,created_at AS createdAt,updated_at AS updatedAt FROM platform_wiki_tabs ORDER BY position,title`).all(),
  ]);
  return Response.json({ news: news.results, wiki: wiki.results });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const founder = await requireFounder(request);
  if (!founder) return apiError("Nur das Gründerkonto darf öffentliche Inhalte verändern", 403);
  const body = await request.json() as { action?: string; id?: string; data?: Record<string, unknown> }, data = body.data ?? {}, db = platformEnv().DB;
  if (body.action === "saveNews") {
    const id = body.id || randomId(), title = text(data.title, 180), slug = slugify(data.slug || title), status = allowedStatus(data.status);
    if (!title || !slug || !text(data.body)) return apiError("Titel, Kurzadresse und Inhalt sind erforderlich");
    const coverUrl = text(data.coverUrl, 1000);
    if (coverUrl && !/^https:\/\//i.test(coverUrl) && !coverUrl.startsWith("/api/v1/uploads?id=")) return apiError("Das Titelbild benötigt eine sichere HTTPS- oder Upload-Adresse");
    try {
      await db.prepare(`INSERT INTO platform_news (id,slug,title,teaser,body,category,cover_url,status,pinned,publish_at,published_at,author_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,teaser=excluded.teaser,body=excluded.body,category=excluded.category,cover_url=excluded.cover_url,status=excluded.status,pinned=excluded.pinned,publish_at=excluded.publish_at,published_at=CASE WHEN excluded.status='published' THEN COALESCE(platform_news.published_at,CURRENT_TIMESTAMP) ELSE platform_news.published_at END,updated_at=CURRENT_TIMESTAMP`).bind(id,slug,title,text(data.teaser,500),text(data.body),text(data.category,80)||"Plattform",coverUrl||null,status,data.pinned?1:0,text(data.publishAt,40)||null,status,founder.id).run();
    } catch { return apiError("Kurzadresse ist bereits vergeben", 409); }
    await audit("platform.news.saved", "platform_news", id, founder.id, { title, status });
    return Response.json({ saved: true, id });
  }
  if (body.action === "archiveNews" && body.id) {
    await db.prepare(`UPDATE platform_news SET status='archived',pinned=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.id).run();
    await audit("platform.news.archived", "platform_news", body.id, founder.id);
    return Response.json({ saved: true });
  }
  if (body.action === "saveWiki") {
    const id = body.id || randomId(), title = text(data.title, 140), slug = slugify(data.slug || title), status = allowedStatus(data.status);
    if (!title || !slug || !text(data.body)) return apiError("Titel, Kurzadresse und Inhalt sind erforderlich");
    try {
      await db.prepare(`INSERT INTO platform_wiki_tabs (id,slug,title,summary,body,position,status,author_id,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,summary=excluded.summary,body=excluded.body,position=excluded.position,status=excluded.status,author_id=excluded.author_id,updated_at=CURRENT_TIMESTAMP`).bind(id,slug,title,text(data.summary,400),text(data.body),Math.max(0,Number(data.position)||0),status,founder.id).run();
    } catch { return apiError("Kurzadresse ist bereits vergeben", 409); }
    await audit("platform.wiki.saved", "platform_wiki_tab", id, founder.id, { title, status });
    return Response.json({ saved: true, id });
  }
  if (body.action === "archiveWiki" && body.id) {
    await db.prepare(`UPDATE platform_wiki_tabs SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.id).run();
    await audit("platform.wiki.archived", "platform_wiki_tab", body.id, founder.id);
    return Response.json({ saved: true });
  }
  return apiError("Unbekannte Inhaltsaktion");
}

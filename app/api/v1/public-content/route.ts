import { ensureDatabase, platformEnv } from "@/lib/platform";

export async function GET(request: Request) {
  await ensureDatabase();
  const db = platformEnv().DB, type = new URL(request.url).searchParams.get("type") ?? "news";
  if (type === "wiki") {
    const rows = await db.prepare(`SELECT id,slug,title,summary,body,position,updated_at AS updatedAt FROM platform_wiki_tabs WHERE status='published' ORDER BY position,title`).all();
    return Response.json({ data: rows.results });
  }
  const rows = await db.prepare(`SELECT id,slug,title,teaser,body,category,cover_url AS coverUrl,pinned,COALESCE(published_at,publish_at,created_at) AS publishedAt FROM platform_news WHERE status='published' AND (publish_at IS NULL OR publish_at<=CURRENT_TIMESTAMP) ORDER BY pinned DESC,COALESCE(published_at,publish_at,created_at) DESC LIMIT 50`).all();
  return Response.json({ data: rows.results });
}

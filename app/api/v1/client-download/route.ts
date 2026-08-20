import { ensureDatabase, platformEnv } from "@/lib/platform";

export async function GET() {
  await ensureDatabase();
  const release = await platformEnv().DB.prepare(
    `SELECT version, download_url AS downloadUrl, checksum, release_notes AS releaseNotes
     FROM client_versions
     WHERE product = 'desktop-client'
       AND channel = 'stable'
       AND download_url IS NOT NULL
       AND length(trim(download_url)) > 0
     ORDER BY published_at DESC, version DESC
     LIMIT 1`,
  ).first<{
    version: string;
    downloadUrl: string;
    checksum: string | null;
    releaseNotes: string | null;
  }>();

  return Response.json({ release: release ?? null }, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}

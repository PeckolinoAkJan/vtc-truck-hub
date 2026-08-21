import { ensureDatabase, platformEnv } from "@/lib/platform";

const CURRENT_RELEASE = {
  version: "1.4.0",
  checksum: null as string | null,
};

export async function GET() {
  await ensureDatabase();
  const db = platformEnv().DB;
  let release = await db.prepare(
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

  // Existing installations can already contain the release row from before the
  // workflow attached the final installer checksum. Repair that row lazily so
  // both the current response and all future updater checks are verifiable.
  if (
    release?.version === CURRENT_RELEASE.version &&
    !release.checksum &&
    CURRENT_RELEASE.checksum
  ) {
    await db.prepare(
      `UPDATE client_versions
       SET checksum = ?
       WHERE product = 'desktop-client' AND version = ?`,
    ).bind(CURRENT_RELEASE.checksum, CURRENT_RELEASE.version).run();
    release = { ...release, checksum: CURRENT_RELEASE.checksum };
  }

  return Response.json({ release: release ?? null }, {
    headers: { "Cache-Control": "no-store" },
  });
}

import {
  apiError,
  audit,
  ensureDatabase,
  getSessionUser,
  platformEnv,
  randomId,
  requireVtcPermission,
} from "@/lib/platform";
const clean = (v: unknown, n = 1000) =>
    String(v ?? "")
      .trim()
      .slice(0, n),
  list = (v: unknown) =>
    Array.isArray(v)
      ? v.map(String).slice(0, 20)
      : clean(v)
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 20);

export async function GET(request: Request) {
  await ensureDatabase();
  const db = platformEnv().DB,
    url = new URL(request.url),
    vtcId = url.searchParams.get("vtcId"),
    mine = url.searchParams.get("mine") === "true",
    moderation = url.searchParams.get("moderation") === "true",
    user = await getSessionUser(request);
  if (moderation && (!vtcId || !(await requireVtcPermission(request, vtcId, "manage_gallery"))))
    return apiError("Galerierecht erforderlich", 403);
  let sql = `SELECT i.*,u.filename,u.content_type AS contentType,u.size,a.title AS albumTitle,usr.display_name AS ownerName FROM media_items i JOIN uploads u ON u.id=i.upload_id LEFT JOIN media_albums a ON a.id=i.album_id JOIN users usr ON usr.id=i.owner_id WHERE 1=1`,
    args: unknown[] = [];
  if (vtcId) {
    sql += " AND i.vtc_id=?";
    args.push(vtcId);
  }
  if (moderation) {
    // Berechtigte Moderatoren sehen auch wartende und abgelehnte Medien.
  } else if (mine) {
    if (!user) return apiError("Anmeldung erforderlich", 401);
    sql += " AND i.owner_id=?";
    args.push(user.id);
  } else sql += " AND i.status='approved' AND i.visibility='public'";
  sql += " ORDER BY i.created_at DESC LIMIT 200";
  const items = await db
    .prepare(sql)
    .bind(...args)
    .all<any>();
  const albums = vtcId
    ? await db
        .prepare(
          `SELECT a.*,(SELECT COUNT(*) FROM media_items i WHERE i.album_id=a.id AND i.status='approved') itemCount FROM media_albums a WHERE a.vtc_id=? AND (a.visibility='public' OR a.owner_id=?) ORDER BY a.created_at DESC`,
        )
        .bind(vtcId, user?.id ?? "")
        .all()
    : { results: [] };
  return Response.json({
    items: items.results.map((x) => ({
      ...x,
      tags: JSON.parse(x.tags || "[]"),
      url: `/api/v1/uploads?id=${x.upload_id}`,
    })),
    albums: albums.results,
  });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const b = (await request.json()) as any,
    db = platformEnv().DB;
  if (b.action === "album") {
    if (
      b.vtcId &&
      !(await requireVtcPermission(request, b.vtcId, "manage_gallery"))
    )
      return apiError("Galerierecht erforderlich", 403);
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO media_albums (id,vtc_id,owner_id,title,description,visibility,event_id) VALUES (?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        b.vtcId || null,
        user.id,
        clean(b.title, 120),
        clean(b.description, 1000) || null,
        b.visibility === "internal" ? "internal" : "public",
        clean(b.eventId, 100) || null,
      )
      .run();
    await audit(
      "gallery.album.created",
      "media_album",
      id,
      user.id,
      {},
      b.vtcId || null,
    );
    return Response.json({ saved: true, id });
  }
  if (b.action === "add") {
    const upload = await db
      .prepare(
        `SELECT u.id,u.owner_id,u.vtc_id,m.status FROM uploads u JOIN upload_metadata m ON m.upload_id=u.id WHERE u.id=? AND m.purpose='gallery'`,
      )
      .bind(b.uploadId)
      .first<any>();
    if (!upload || upload.owner_id !== user.id)
      return apiError("Galerie-Upload nicht gefunden", 404);
    if (b.vtcId && upload.vtc_id !== b.vtcId)
      return apiError("Upload gehört zu einer anderen Spedition", 409);
    const manager = b.vtcId
        ? Boolean(
            await requireVtcPermission(request, b.vtcId, "manage_gallery"),
          )
        : true,
      status = manager ? "approved" : upload.status,
      id = randomId();
    await db
      .prepare(
        `INSERT INTO media_items (id,album_id,upload_id,vtc_id,owner_id,caption,tags,visibility,status,event_id,trip_id,vehicle_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        clean(b.albumId, 100) || null,
        b.uploadId,
        b.vtcId || null,
        user.id,
        clean(b.caption, 1200) || null,
        JSON.stringify(list(b.tags)),
        b.visibility === "internal" ? "internal" : "public",
        status,
        clean(b.eventId, 100) || null,
        clean(b.tripId, 100) || null,
        clean(b.vehicleId, 100) || null,
      )
      .run();
    await audit(
      "gallery.item.created",
      "media_item",
      id,
      user.id,
      { status },
      b.vtcId || null,
    );
    return Response.json({ saved: true, id, status });
  }
  if (b.action === "moderate") {
    if (
      !b.vtcId ||
      !(await requireVtcPermission(request, b.vtcId, "manage_gallery"))
    )
      return apiError("Galerierecht erforderlich", 403);
    const status = b.status === "approved" ? "approved" : "rejected";
    await db.batch([
      db
        .prepare(`UPDATE media_items SET status=? WHERE id=? AND vtc_id=?`)
        .bind(status, b.id, b.vtcId),
      db
        .prepare(
          `UPDATE upload_metadata SET status=?,moderated_by=?,moderated_at=CURRENT_TIMESTAMP WHERE upload_id=(SELECT upload_id FROM media_items WHERE id=? AND vtc_id=?)`,
        )
        .bind(status, user.id, b.id, b.vtcId),
    ]);
    await audit(
      "gallery.item.moderated",
      "media_item",
      clean(b.id, 100),
      user.id,
      { status },
      b.vtcId,
    );
    return Response.json({ saved: true, status });
  }
  return apiError("Ungültige Galerieaktion");
}

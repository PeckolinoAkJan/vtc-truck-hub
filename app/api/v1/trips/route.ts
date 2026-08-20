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
  tripId?: string;
  tripIds?: string[];
  trip?: Record<string, unknown>;
  status?: string;
  reason?: string;
  field?: string;
  value?: unknown;
  comment?: string;
  internal?: boolean;
  uploadId?: string;
};
const editable = new Set([
  "mode",
  "source_city",
  "destination_city",
  "cargo",
  "distance_km",
  "fuel_liters",
  "damage",
  "income",
  "status",
]);
const clean = (v: unknown, n = 1000) =>
  String(v ?? "")
    .trim()
    .slice(0, n);
export async function GET(request: Request) {
  await ensureDatabase();
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const url = new URL(request.url),
    db = platformEnv().DB,
    vtcId = (await resolveVtcId(request,url.searchParams.get("vtcId"))) ?? "",
    canReview = Boolean(
      await requireVtcPermission(request, vtcId, "review_trips"),
    ),
    mine = url.searchParams.get("mine") === "1" || !canReview,
    game = url.searchParams.get("game"),
    status = url.searchParams.get("status"),
    q = url.searchParams.get("q");
  let sql = `SELECT t.id,t.vtc_id AS vtcId,t.user_id AS userId,u.display_name AS driver,t.game,t.mode,t.source_city AS sourceCity,t.destination_city AS destinationCity,t.cargo,t.distance_km AS distanceKm,t.fuel_liters AS fuelLiters,t.damage,t.income,t.status,t.started_at AS startedAt,t.completed_at AS completedAt,t.telemetry_source AS telemetrySource,r.status AS reviewStatus,r.reason AS reviewReason FROM trips t LEFT JOIN users u ON u.id=t.user_id LEFT JOIN trip_reviews r ON r.trip_id=t.id WHERE t.vtc_id=?`,
    args: unknown[] = [vtcId];
  if (mine) {
    sql += ` AND t.user_id=?`;
    args.push(user.id);
  }
  if (game) {
    sql += ` AND t.game=?`;
    args.push(game);
  }
  if (status) {
    sql += ` AND t.status=?`;
    args.push(status);
  }
  if (q) {
    sql += ` AND (t.source_city LIKE ? OR t.destination_city LIKE ? OR t.cargo LIKE ? OR u.display_name LIKE ?)`;
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY t.started_at DESC LIMIT 500`;
  const rows = await db
      .prepare(sql)
      .bind(...args)
      .all(),
    ids = rows.results.map((r) => String(r.id));
  let comments: { results: Record<string, unknown>[] } = { results: [] },
    edits: { results: Record<string, unknown>[] } = { results: [] },
    evidence: { results: Record<string, unknown>[] } = { results: [] };
  if (ids.length) {
    const marks = ids.map(() => "?").join(",");
    comments = await db
      .prepare(
        `SELECT c.id,c.trip_id AS tripId,c.body,c.internal,c.created_at AS createdAt,u.display_name AS author FROM trip_comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.trip_id IN (${marks}) AND (c.internal=0 OR ?) ORDER BY c.created_at`,
      )
      .bind(...ids, canReview ? 1 : 0)
      .all();
    edits = await db
      .prepare(
        `SELECT e.trip_id AS tripId,e.field,e.old_value AS oldValue,e.new_value AS newValue,e.reason,e.created_at AS createdAt,u.display_name AS actor FROM trip_edits e LEFT JOIN users u ON u.id=e.actor_id WHERE e.trip_id IN (${marks}) ORDER BY e.created_at`,
      )
      .bind(...ids)
      .all();
    evidence = await db
      .prepare(
        `SELECT e.id,e.trip_id AS tripId,e.upload_id AS uploadId,e.kind,u.filename,u.content_type AS contentType FROM trip_evidence e JOIN uploads u ON u.id=e.upload_id WHERE e.trip_id IN (${marks})`,
      )
      .bind(...ids)
      .all();
  }
  if (url.searchParams.get("format") === "csv") {
    const header =
        "ID;Fahrer;Spiel;Start;Ziel;Fracht;Kilometer;Schaden;Einnahmen;Status\n",
      lines = rows.results
        .map((r) =>
          [
            r.id,
            r.driver,
            r.game,
            r.sourceCity,
            r.destinationCity,
            r.cargo,
            r.distanceKm,
            r.damage,
            r.income,
            r.status,
          ]
            .map((x) => `"${String(x ?? "").replaceAll('"', '""')}"`)
            .join(";"),
        )
        .join("\n");
    return new Response("\ufeff" + header + lines, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=fahrtenbuch.csv",
      },
    });
  }
  return Response.json({
    canReview,
    trips: rows.results,
    comments: comments.results,
    edits: edits.results,
    evidence: evidence.results,
  });
}
export async function POST(request: Request) {
  await ensureDatabase();
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const b = (await request.json()) as Body,
    db = platformEnv().DB,
    vtcId = (await resolveVtcId(request,b.vtcId)) ?? "";
  if (b.action === "manual" && b.trip) {
    const member = await db
      .prepare(
        `SELECT id FROM memberships WHERE vtc_id=? AND user_id=? AND status IN ('active','probation')`,
      )
      .bind(vtcId, user.id)
      .first();
    if (!member) return apiError("Aktive Mitgliedschaft erforderlich", 403);
    const t = b.trip,
      id = randomId();
    if (
      !["ETS2", "ATS"].includes(clean(t.game, 10)) ||
      !clean(t.sourceCity) ||
      !clean(t.destinationCity)
    )
      return apiError("Spiel, Start und Ziel erforderlich");
    await db.batch([
      db
        .prepare(
          `INSERT INTO trips (id,vtc_id,user_id,game,mode,source_city,destination_city,cargo,distance_km,fuel_liters,damage,income,status,started_at,completed_at,telemetry_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending_review',?,?, 'manual')`,
        )
        .bind(
          id,
          vtcId,
          user.id,
          clean(t.game, 10),
          clean(t.mode, 30) || "Singleplayer",
          clean(t.sourceCity, 100),
          clean(t.destinationCity, 100),
          clean(t.cargo, 160) || null,
          Number(t.distanceKm) || 0,
          Number(t.fuelLiters) || 0,
          Number(t.damage) || 0,
          Number(t.income) || 0,
          clean(t.startedAt, 30) || new Date().toISOString(),
          clean(t.completedAt, 30) || new Date().toISOString(),
        ),
      db
        .prepare(
          `INSERT INTO trip_reviews (id,trip_id,status) VALUES (?,?,'pending_review')`,
        )
        .bind(randomId(), id),
    ]);
    await audit("trip.manual.created", "trip", id, user.id, {}, vtcId);
    return Response.json({ saved: true, id });
  }
  if (!b.tripId && b.action !== "massReview")
    return apiError("Fahrt-ID erforderlich");
  const trip = b.tripId
    ? await db
        .prepare(
          `SELECT id,user_id AS userId,status FROM trips WHERE id=? AND vtc_id=?`,
        )
        .bind(b.tripId, vtcId)
        .first<{ id: string; userId: string; status: string }>()
    : null;
  if (b.tripId && !trip) return apiError("Fahrt nicht gefunden", 404);
  if (b.action === "comment" && b.comment?.trim()) {
    if (
      trip!.userId !== user.id &&
      !(await requireVtcPermission(request, vtcId, "review_trips"))
    )
      return apiError("Kein Zugriff", 403);
    await db
      .prepare(
        `INSERT INTO trip_comments (id,trip_id,author_id,body,internal) VALUES (?,?,?,?,?)`,
      )
      .bind(
        randomId(),
        trip!.id,
        user.id,
        b.comment.trim().slice(0, 4000),
        b.internal ? 1 : 0,
      )
      .run();
    return Response.json({ saved: true });
  }
  if (b.action === "evidence" && b.uploadId) {
    if (
      trip!.userId !== user.id &&
      !(await requireVtcPermission(request, vtcId, "review_trips"))
    )
      return apiError("Kein Zugriff", 403);
    const upload = await db
      .prepare(`SELECT id FROM uploads WHERE id=? AND owner_id=?`)
      .bind(b.uploadId, user.id)
      .first();
    if (!upload) return apiError("Upload nicht gefunden", 404);
    await db
      .prepare(
        `INSERT INTO trip_evidence (id,trip_id,upload_id,created_by) VALUES (?,?,?,?)`,
      )
      .bind(randomId(), trip!.id, b.uploadId, user.id)
      .run();
    return Response.json({ saved: true });
  }
  if (b.action === "correct" && b.field && editable.has(b.field)) {
    const actor = await requireVtcPermission(request, vtcId, "review_trips");
    if (!actor) return apiError("Fahrtenprüfrecht erforderlich", 403);
    const old = await db
      .prepare(`SELECT ${b.field} AS value FROM trips WHERE id=?`)
      .bind(trip!.id)
      .first<{ value: unknown }>();
    await db.batch([
      db
        .prepare(`UPDATE trips SET ${b.field}=? WHERE id=?`)
        .bind(b.value ?? null, trip!.id),
      db
        .prepare(
          `INSERT INTO trip_edits (id,trip_id,actor_id,field,old_value,new_value,reason) VALUES (?,?,?,?,?,?,?)`,
        )
        .bind(
          randomId(),
          trip!.id,
          actor.id,
          b.field,
          String(old?.value ?? ""),
          String(b.value ?? ""),
          clean(b.reason, 1000) || null,
        ),
    ]);
    await audit(
      "trip.corrected",
      "trip",
      trip!.id,
      actor.id,
      { field: b.field },
      vtcId,
    );
    return Response.json({ saved: true });
  }
  if (b.action === "review" && b.status) {
    const actor = await requireVtcPermission(request, vtcId, "review_trips");
    if (!actor) return apiError("Fahrtenprüfrecht erforderlich", 403);
    if (!["approved", "rejected", "corrected"].includes(b.status))
      return apiError("Ungültiger Prüfstatus");
    await db.batch([
      db
        .prepare(
          `INSERT INTO trip_reviews (id,trip_id,status,reviewed_by,reviewed_at,reason) VALUES (?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(trip_id) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=CURRENT_TIMESTAMP,reason=excluded.reason`,
        )
        .bind(
          randomId(),
          trip!.id,
          b.status,
          actor.id,
          clean(b.reason, 1000) || null,
        ),
      db
        .prepare(`UPDATE trips SET status=? WHERE id=?`)
        .bind(b.status, trip!.id),
    ]);
    await audit(
      `trip.${b.status}`,
      "trip",
      trip!.id,
      actor.id,
      { reason: b.reason },
      vtcId,
    );
    return Response.json({ saved: true });
  }
  if (b.action === "massReview" && b.tripIds?.length) {
    const actor = await requireVtcPermission(request, vtcId, "review_trips");
    if (!actor) return apiError("Fahrtenprüfrecht erforderlich", 403);
    for (const id of b.tripIds.slice(0, 200))
      await db.batch([
        db
          .prepare(
            `INSERT INTO trip_reviews (id,trip_id,status,reviewed_by,reviewed_at) SELECT ?,id,'approved',?,CURRENT_TIMESTAMP FROM trips WHERE id=? AND vtc_id=? ON CONFLICT(trip_id) DO UPDATE SET status='approved',reviewed_by=excluded.reviewed_by,reviewed_at=CURRENT_TIMESTAMP`,
          )
          .bind(randomId(), actor.id, id, vtcId),
        db
          .prepare(`UPDATE trips SET status='approved' WHERE id=? AND vtc_id=?`)
          .bind(id, vtcId),
      ]);
    await audit(
      "trip.mass_approved",
      "trip",
      null,
      actor.id,
      { count: b.tripIds.length },
      vtcId,
    );
    return Response.json({ saved: true, count: b.tripIds.length });
  }
  return apiError("Ungültige Fahrtenaktion");
}
import {resolveVtcId} from "@/lib/platform";

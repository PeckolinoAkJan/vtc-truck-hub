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
  vehicleId?: string;
  reservationId?: string;
  data?: Record<string, unknown>;
};
const clean = (v: unknown, n = 1000) =>
  String(v ?? "")
    .trim()
    .slice(0, n);
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
  if (!member && !(await requireVtcPermission(request, vtcId, "manage_fleet")))
    return apiError("Keine Mitgliedschaft", 403);
  const [vehicles, maintenance, reservations, transfers, drivers] =
    await Promise.all([
      db
        .prepare(
          `SELECT v.*,d.*,v.id AS id,v.number AS number,v.type AS type,v.status AS status,u.display_name AS assigned_driver FROM vehicles v LEFT JOIN vehicle_details d ON d.vehicle_id=v.id LEFT JOIN users u ON u.id=v.assigned_user_id WHERE v.vtc_id=? ORDER BY v.status,v.number`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT m.*,v.number AS vehicle_number FROM maintenance_records m JOIN vehicles v ON v.id=m.vehicle_id WHERE v.vtc_id=? ORDER BY COALESCE(m.scheduled_at,m.created_at) DESC LIMIT 300`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT r.*,v.number AS vehicle_number,u.display_name AS driver_name FROM vehicle_reservations r JOIN vehicles v ON v.id=r.vehicle_id JOIN users u ON u.id=r.user_id WHERE v.vtc_id=? ORDER BY r.created_at DESC LIMIT 300`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT t.*,v.number AS vehicle_number FROM vehicle_transfers t JOIN vehicles v ON v.id=t.vehicle_id WHERE v.vtc_id=? ORDER BY t.created_at DESC LIMIT 200`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT u.id,u.display_name AS name,m.driver_number FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.vtc_id=? AND m.status IN ('active','probation') ORDER BY u.display_name`,
        )
        .bind(vtcId)
        .all(),
    ]);
  const rows = vehicles.results as Array<Record<string, unknown>>,
    km = rows.reduce((n, v) => n + Number(v.mileage || 0), 0),
    cost = (maintenance.results as Array<Record<string, unknown>>).reduce(
      (n, m) => n + Number(m.cost_cents || 0),
      0,
    );
  return Response.json({
    user,
    canManage: Boolean(
      await requireVtcPermission(request, vtcId, "manage_fleet"),
    ),
    vehicles: rows,
    maintenance: maintenance.results,
    reservations: reservations.results,
    transfers: transfers.results,
    drivers: drivers.results,
    stats: {
      total: rows.length,
      available: rows.filter((v) => v.status === "available").length,
      inUse: rows.filter((v) => v.status === "in_use").length,
      maintenance: rows.filter((v) => v.status === "maintenance").length,
      totalKm: km,
      maintenanceCostCents: cost,
    },
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
  if (b.action === "request") {
    if (!b.vehicleId) return apiError("Fahrzeug fehlt");
    const v = await db
      .prepare(`SELECT id,status FROM vehicles WHERE id=? AND vtc_id=?`)
      .bind(b.vehicleId, vtcId)
      .first<{ id: string; status: string }>();
    if (!v) return apiError("Fahrzeug nicht gefunden", 404);
    if (!["available", "reserved"].includes(v.status))
      return apiError("Fahrzeug ist nicht verfügbar", 409);
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO vehicle_reservations (id,vehicle_id,user_id,starts_at,ends_at,note) VALUES (?,?,?,?,?,?)`,
      )
      .bind(
        id,
        v.id,
        user.id,
        clean(d.startsAt, 30) || new Date().toISOString(),
        clean(d.endsAt, 30) || null,
        clean(d.note, 1000) || null,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  const actor = await requireVtcPermission(request, vtcId, "manage_fleet");
  if (!actor) return apiError("Fuhrparkrecht erforderlich", 403);
  if (b.action === "save") {
    const id = b.vehicleId || randomId(),
      number = clean(d.number, 40),
      brand = clean(d.brand, 80),
      model = clean(d.model, 80);
    if (!number || !brand || !model)
      return apiError("Fahrzeugnummer, Marke und Modell sind Pflicht");
    await db.batch([
      db
        .prepare(
          `INSERT INTO vehicles (id,vtc_id,number,type,brand,model,license_plate,mileage,status,assigned_user_id) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET number=excluded.number,type=excluded.type,brand=excluded.brand,model=excluded.model,license_plate=excluded.license_plate,mileage=excluded.mileage,status=excluded.status,assigned_user_id=excluded.assigned_user_id`,
        )
        .bind(
          id,
          vtcId,
          number,
          clean(d.type, 20) || "truck",
          brand,
          model,
          clean(d.licensePlate, 40) || null,
          Number(d.mileage) || 0,
          clean(d.status, 30) || "available",
          clean(d.assignedUserId, 100) || null,
        ),
      db
        .prepare(
          `INSERT INTO vehicle_details (vehicle_id,series,year,paint,engine,transmission,chassis,axle_config,tank_capacity,purchase_price_cents,purchase_date,leasing,location,garage,branch,maintenance_interval_km,next_maintenance_km,reliability,image_upload_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(vehicle_id) DO UPDATE SET series=excluded.series,year=excluded.year,paint=excluded.paint,engine=excluded.engine,transmission=excluded.transmission,chassis=excluded.chassis,axle_config=excluded.axle_config,tank_capacity=excluded.tank_capacity,purchase_price_cents=excluded.purchase_price_cents,purchase_date=excluded.purchase_date,leasing=excluded.leasing,location=excluded.location,garage=excluded.garage,branch=excluded.branch,maintenance_interval_km=excluded.maintenance_interval_km,next_maintenance_km=excluded.next_maintenance_km,reliability=excluded.reliability,image_upload_id=excluded.image_upload_id,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(
          id,
          clean(d.series, 80) || null,
          Number(d.year) || null,
          clean(d.paint, 120) || null,
          clean(d.engine, 100) || null,
          clean(d.transmission, 100) || null,
          clean(d.chassis, 100) || null,
          clean(d.axleConfig, 60) || null,
          Number(d.tankCapacity) || null,
          Math.round(Number(d.purchasePriceCents) || 0),
          clean(d.purchaseDate, 20) || null,
          d.leasing ? 1 : 0,
          clean(d.location, 100) || null,
          clean(d.garage, 100) || null,
          clean(d.branch, 100) || null,
          Number(d.maintenanceIntervalKm) || 30000,
          Number(d.nextMaintenanceKm) || null,
          Math.max(0, Math.min(100, Number(d.reliability) || 100)),
          clean(d.imageUploadId, 100) || null,
        ),
    ]);
    await audit(
      "fleet.vehicle.saved",
      "vehicle",
      id,
      actor.id,
      { number },
      vtcId,
    );
    return Response.json({ saved: true, id });
  }
  if (b.action === "maintenance") {
    if (!b.vehicleId || !clean(d.description))
      return apiError("Fahrzeug und Beschreibung erforderlich");
    const id = randomId();
    await db.batch([
      db
        .prepare(
          `INSERT INTO maintenance_records (id,vehicle_id,type,description,cost_cents,mileage,scheduled_at,completed_at,status,workshop,created_by) SELECT ?,id,?,?,?,?,?,?,?,?,? FROM vehicles WHERE id=? AND vtc_id=?`,
        )
        .bind(
          id,
          clean(d.type, 60) || "maintenance",
          clean(d.description, 2000),
          Math.round(Number(d.costCents) || 0),
          Number(d.mileage) || null,
          clean(d.scheduledAt, 30) || null,
          d.status === "completed" ? new Date().toISOString() : null,
          clean(d.status, 20) || "planned",
          clean(d.workshop, 120) || null,
          actor.id,
          b.vehicleId,
          vtcId,
        ),
      db
        .prepare(
          `UPDATE vehicles SET status=CASE WHEN ?='completed' THEN status ELSE 'maintenance' END WHERE id=? AND vtc_id=?`,
        )
        .bind(clean(d.status, 20), b.vehicleId, vtcId),
    ]);
    await audit(
      "fleet.maintenance.created",
      "vehicle",
      b.vehicleId,
      actor.id,
      { id },
      vtcId,
    );
    return Response.json({ saved: true, id });
  }
  if (b.action === "completeMaintenance") {
    const id = clean(d.id, 100);
    await db.batch([
      db
        .prepare(
          `UPDATE maintenance_records SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=? AND vehicle_id IN (SELECT id FROM vehicles WHERE vtc_id=?)`,
        )
        .bind(id, vtcId),
      db
        .prepare(
          `UPDATE vehicles SET status='available' WHERE id=(SELECT vehicle_id FROM maintenance_records WHERE id=?)`,
        )
        .bind(id),
    ]);
    return Response.json({ saved: true });
  }
  if (b.action === "reviewReservation") {
    if (!b.reservationId) return apiError("Reservierung fehlt");
    const status = clean(d.status, 20);
    if (!["approved", "rejected", "cancelled"].includes(status))
      return apiError("Ungültiger Status");
    const row = await db
      .prepare(
        `SELECT r.vehicle_id AS vehicleId,r.user_id AS userId FROM vehicle_reservations r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=? AND v.vtc_id=?`,
      )
      .bind(b.reservationId, vtcId)
      .first<{ vehicleId: string; userId: string }>();
    if (!row) return apiError("Reservierung nicht gefunden", 404);
    await db.batch([
      db
        .prepare(
          `UPDATE vehicle_reservations SET status=?,reviewed_by=? WHERE id=?`,
        )
        .bind(status, actor.id, b.reservationId),
      db
        .prepare(
          `UPDATE vehicles SET status=CASE WHEN ?='approved' THEN 'reserved' ELSE 'available' END,assigned_user_id=CASE WHEN ?='approved' THEN ? ELSE assigned_user_id END WHERE id=?`,
        )
        .bind(status, status, row.userId, row.vehicleId),
    ]);
    return Response.json({ saved: true });
  }
  if (b.action === "transfer") {
    if (!b.vehicleId || !clean(d.toBranch))
      return apiError("Zielniederlassung erforderlich");
    const current = await db
        .prepare(`SELECT branch FROM vehicle_details WHERE vehicle_id=?`)
        .bind(b.vehicleId)
        .first<{ branch: string | null }>(),
      id = randomId();
    await db.batch([
      db
        .prepare(
          `INSERT INTO vehicle_transfers (id,vehicle_id,from_branch,to_branch,note,actor_id) VALUES (?,?,?,?,?,?)`,
        )
        .bind(
          id,
          b.vehicleId,
          current?.branch ?? null,
          clean(d.toBranch, 100),
          clean(d.note, 1000) || null,
          actor.id,
        ),
      db
        .prepare(
          `UPDATE vehicle_details SET branch=?,updated_at=CURRENT_TIMESTAMP WHERE vehicle_id=?`,
        )
        .bind(clean(d.toBranch, 100), b.vehicleId),
    ]);
    return Response.json({ saved: true, id });
  }
  if (b.action === "sell") {
    if (!b.vehicleId) return apiError("Fahrzeug fehlt");
    await db
      .prepare(
        `UPDATE vehicles SET status='sold',assigned_user_id=NULL WHERE id=? AND vtc_id=?`,
      )
      .bind(b.vehicleId, vtcId)
      .run();
    await audit(
      "fleet.vehicle.sold",
      "vehicle",
      b.vehicleId,
      actor.id,
      {},
      vtcId,
    );
    return Response.json({ saved: true });
  }
  return apiError("Ungültige Fuhrparkaktion");
}
import {resolveVtcId} from "@/lib/platform";

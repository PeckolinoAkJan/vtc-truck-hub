import {
  apiError,
  audit,
  ensureDatabase,
  getSessionUser,
  platformEnv,
  randomId,
  requireVtcPermission,
  resolveVtcId,
} from "@/lib/platform";
import { refreshBindingUsage } from "@/lib/fleet-compliance";
import { ensureFinanceAccount } from "@/lib/payroll";

type Body = {
  action?: string;
  vtcId?: string;
  vehicleId?: string;
  bindingId?: string;
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
  const [vehicles, maintenance, reservations, transfers, drivers, bindings, incidents, policy] =
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
      db
        .prepare(
          `SELECT b.id,b.vehicle_id AS vehicleId,b.asset_type AS assetType,b.game,b.game_config_id AS gameConfigId,
                  b.display_name AS displayName,b.license_plate AS licensePlate,b.last_seen_at AS lastSeenAt,
                  b.paired_user_id AS detectedUserId,v.number AS vehicleNumber,v.status AS vehicleStatus,
                  u.display_name AS detectedBy
           FROM vehicle_game_bindings b
           LEFT JOIN vehicles v ON v.id=b.vehicle_id
           LEFT JOIN users u ON u.id=b.paired_user_id
           WHERE b.vtc_id=? AND b.active=1 ORDER BY b.last_seen_at DESC LIMIT 300`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT i.*,u.display_name AS driver_name,v.number AS vehicle_number
           FROM fleet_incidents i LEFT JOIN users u ON u.id=i.user_id LEFT JOIN vehicles v ON v.id=i.vehicle_id
           WHERE i.vtc_id=? ORDER BY i.resolved_at IS NULL DESC,i.created_at DESC LIMIT 300`,
        )
        .bind(vtcId)
        .all(),
      db
        .prepare(
          `SELECT unpaired_action AS unpairedAction,maintenance_due_action AS maintenanceDueAction,
                  external_trailers_allowed AS externalTrailersAllowed,voice_warnings AS voiceWarnings
           FROM fleet_policies WHERE vtc_id=?`,
        )
        .bind(vtcId)
        .first(),
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
    bindings: bindings.results,
    incidents: incidents.results,
    policy: policy ?? {
      unpairedAction: "review",
      maintenanceDueAction: "warn",
      externalTrailersAllowed: 1,
      voiceWarnings: 1,
    },
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
  if (b.action === "savePolicy") {
    const unpairedAction = clean(d.unpairedAction, 20);
    const maintenanceDueAction = clean(d.maintenanceDueAction, 20);
    if (!["review", "block"].includes(unpairedAction))
      return apiError("Ungültige Regel für ungekoppelte Fahrzeuge");
    if (!["warn", "block"].includes(maintenanceDueAction))
      return apiError("Ungültige Wartungsregel");
    await db.prepare(
      `INSERT INTO fleet_policies
       (vtc_id,unpaired_action,maintenance_due_action,external_trailers_allowed,voice_warnings,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(vtc_id) DO UPDATE SET
         unpaired_action=excluded.unpaired_action,maintenance_due_action=excluded.maintenance_due_action,
         external_trailers_allowed=excluded.external_trailers_allowed,voice_warnings=excluded.voice_warnings,
         updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
    ).bind(
      vtcId,
      unpairedAction,
      maintenanceDueAction,
      d.externalTrailersAllowed ? 1 : 0,
      d.voiceWarnings ? 1 : 0,
      actor.id,
    ).run();
    await audit("fleet.policy.saved", "fleet_policy", vtcId, actor.id, d, vtcId);
    return Response.json({ saved: true });
  }
  if (b.action === "pairBinding") {
    if (!b.bindingId || !b.vehicleId) return apiError("Erkennung und Fahrzeug erforderlich");
    const binding = await db.prepare(
      `SELECT asset_type AS assetType FROM vehicle_game_bindings WHERE id=? AND vtc_id=? AND active=1`,
    ).bind(b.bindingId, vtcId).first<{ assetType: string }>();
    const vehicle = await db.prepare(
      `SELECT type FROM vehicles WHERE id=? AND vtc_id=? AND status<>'sold'`,
    ).bind(b.vehicleId, vtcId).first<{ type: string }>();
    if (!binding || !vehicle) return apiError("Erkennung oder Fahrzeug nicht gefunden", 404);
    if (binding.assetType !== vehicle.type) return apiError("LKW und Auflieger können nicht miteinander gekoppelt werden");
    await db.prepare(
      `UPDATE vehicle_game_bindings SET vehicle_id=?,paired_user_id=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=? AND vtc_id=?`,
    ).bind(b.vehicleId, actor.id, b.bindingId, vtcId).run();
    await refreshBindingUsage(vtcId, b.bindingId, b.vehicleId);
    await audit("fleet.binding.paired", "vehicle", b.vehicleId, actor.id, { bindingId: b.bindingId }, vtcId);
    return Response.json({ saved: true });
  }
  if (b.action === "importBinding") {
    if (!b.bindingId) return apiError("Erkennung fehlt");
    const binding = await db.prepare(
      `SELECT asset_type AS assetType,game,game_config_id AS gameConfigId,brand_id AS brandId,
              display_name AS displayName,license_plate AS licensePlate,paired_user_id AS detectedUserId
       FROM vehicle_game_bindings WHERE id=? AND vtc_id=? AND active=1`,
    ).bind(b.bindingId, vtcId).first<{
      assetType: string;
      game: string;
      gameConfigId: string | null;
      brandId: string | null;
      displayName: string | null;
      licensePlate: string | null;
      detectedUserId: string | null;
    }>();
    if (!binding) return apiError("Erkanntes Fahrzeug nicht gefunden", 404);
    if (!["truck", "trailer"].includes(binding.assetType))
      return apiError("Ungültiger Fahrzeugtyp");
    const assignedUserId =
      clean(d.assignedUserId, 100) || binding.detectedUserId || actor.id;
    const assignedMember = await db.prepare(
      `SELECT id FROM memberships
       WHERE vtc_id=? AND user_id=? AND status IN ('active','probation')`,
    ).bind(vtcId, assignedUserId).first();
    if (!assignedMember) return apiError("Der ausgewählte Fahrer gehört nicht zur Spedition", 409);

    const displayName = clean(binding.displayName || binding.gameConfigId || "", 160);
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const fallbackBrand = binding.assetType === "trailer" ? "SCS" : "Unbekannt";
    const brand = clean(d.brand, 80) || nameParts.shift() || clean(binding.brandId, 80) || fallbackBrand;
    const model = clean(d.model, 80) || nameParts.join(" ") || displayName || "Spiel-Fahrzeug";
    const prefix = binding.assetType === "trailer" ? "AUF" : "LKW";
    const existingCount = await db.prepare(
      `SELECT COUNT(*) AS count FROM vehicles WHERE vtc_id=? AND type=?`,
    ).bind(vtcId, binding.assetType).first<{ count: number }>();
    let sequence = Number(existingCount?.count || 0) + 1;
    let number = clean(d.number, 40) || `${prefix}-${String(sequence).padStart(3, "0")}`;
    while (await db.prepare(`SELECT id FROM vehicles WHERE vtc_id=? AND number=?`).bind(vtcId, number).first()) {
      sequence += 1;
      number = `${prefix}-${String(sequence).padStart(3, "0")}`;
    }
    const vehicleId = randomId();
    await db.batch([
      db.prepare(
        `INSERT INTO vehicles
         (id,vtc_id,number,type,brand,model,license_plate,mileage,status,assigned_user_id)
         VALUES (?,?,?,?,?,?,?,0,'available',?)`,
      ).bind(
        vehicleId,
        vtcId,
        number,
        binding.assetType,
        brand,
        model,
        clean(binding.licensePlate, 40) || null,
        assignedUserId,
      ),
      db.prepare(
        `INSERT OR IGNORE INTO vehicle_details
         (vehicle_id,maintenance_interval_km,reliability,updated_at)
         VALUES (?,30000,100,CURRENT_TIMESTAMP)`,
      ).bind(vehicleId),
      db.prepare(
        `UPDATE vehicle_game_bindings
         SET vehicle_id=?,paired_user_id=?,last_seen_at=CURRENT_TIMESTAMP
         WHERE id=? AND vtc_id=?`,
      ).bind(vehicleId, assignedUserId, b.bindingId, vtcId),
    ]);
    await refreshBindingUsage(vtcId, b.bindingId, vehicleId);
    await audit(
      "fleet.binding.imported",
      "vehicle",
      vehicleId,
      actor.id,
      { bindingId: b.bindingId, assignedUserId, number, game: binding.game },
      vtcId,
    );
    return Response.json({ saved: true, vehicleId, number });
  }
  if (b.action === "unpairBinding") {
    if (!b.bindingId) return apiError("Erkennung fehlt");
    await db.prepare(
      `UPDATE vehicle_game_bindings SET vehicle_id=NULL,paired_user_id=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=? AND vtc_id=?`,
    ).bind(actor.id, b.bindingId, vtcId).run();
    await refreshBindingUsage(vtcId, b.bindingId, null);
    await audit("fleet.binding.unpaired", "vehicle_binding", b.bindingId, actor.id, {}, vtcId);
    return Response.json({ saved: true });
  }
  if (b.action === "resolveIncident") {
    const id = clean(d.id, 100);
    if (!id) return apiError("Vorfall fehlt");
    await db.prepare(`UPDATE fleet_incidents SET resolved_at=CURRENT_TIMESTAMP WHERE id=? AND vtc_id=?`).bind(id, vtcId).run();
    await audit("fleet.incident.resolved", "fleet_incident", id, actor.id, {}, vtcId);
    return Response.json({ saved: true });
  }
  if (b.action === "save") {
    const id = b.vehicleId || randomId(),
      number = clean(d.number, 40),
      brand = clean(d.brand, 80),
      model = clean(d.model, 80),
      vehicleType = clean(d.type, 20) || "truck",
      vehicleStatus = clean(d.status, 30) || "available";
    if (!number || !brand || !model)
      return apiError("Fahrzeugnummer, Marke und Modell sind Pflicht");
    if (!["truck", "trailer"].includes(vehicleType))
      return apiError("Ungültiger Fahrzeugtyp");
    if (![
      "available",
      "reserved",
      "in_use",
      "maintenance",
      "defective",
      "out_of_service",
      "sold",
    ].includes(vehicleStatus))
      return apiError("Ungültiger Fahrzeugstatus");
    if (b.vehicleId) {
      const existing = await db
        .prepare(`SELECT id FROM vehicles WHERE id=? AND vtc_id=?`)
        .bind(b.vehicleId, vtcId)
        .first();
      if (!existing) return apiError("Fahrzeug nicht gefunden", 404);
    }
    await db.batch([
      db
        .prepare(
          `INSERT INTO vehicles (id,vtc_id,number,type,brand,model,license_plate,mileage,status,assigned_user_id) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET number=excluded.number,type=excluded.type,brand=excluded.brand,model=excluded.model,license_plate=excluded.license_plate,mileage=excluded.mileage,status=excluded.status,assigned_user_id=excluded.assigned_user_id`,
        )
        .bind(
          id,
          vtcId,
          number,
          vehicleType,
          brand,
          model,
          clean(d.licensePlate, 40) || null,
          Math.max(0, Number(d.mileage) || 0),
          vehicleStatus,
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
          Math.max(0, Math.round(Number(d.purchasePriceCents) || 0)),
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
    const maintenanceStatus = clean(d.status, 20) || "planned";
    if (!["planned", "in_progress"].includes(maintenanceStatus))
      return apiError("Neue Werkstattaufträge müssen geplant oder in Arbeit sein");
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
          Math.max(0, Math.round(Number(d.costCents) || 0)),
          Number(d.mileage) > 0 ? Number(d.mileage) : null,
          clean(d.scheduledAt, 30) || null,
          null,
          maintenanceStatus,
          clean(d.workshop, 120) || null,
          actor.id,
          b.vehicleId,
          vtcId,
        ),
      db
        .prepare(
          `UPDATE vehicles SET status=CASE WHEN ?='in_progress' THEN 'maintenance' ELSE status END WHERE id=? AND vtc_id=?`,
        )
        .bind(maintenanceStatus, b.vehicleId, vtcId),
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
  if (b.action === "startMaintenance") {
    const id = clean(d.id, 100);
    const record = await db
      .prepare(
        `SELECT m.vehicle_id AS vehicleId,m.status
         FROM maintenance_records m JOIN vehicles v ON v.id=m.vehicle_id
         WHERE m.id=? AND v.vtc_id=?`,
      )
      .bind(id, vtcId)
      .first<{ vehicleId: string; status: string }>();
    if (!record) return apiError("Wartung nicht gefunden", 404);
    if (record.status === "completed") return apiError("Wartung ist bereits abgeschlossen", 409);
    await db.batch([
      db
        .prepare(`UPDATE maintenance_records SET status='in_progress' WHERE id=?`)
        .bind(id),
      db
        .prepare(`UPDATE vehicles SET status='maintenance' WHERE id=? AND vtc_id=?`)
        .bind(record.vehicleId, vtcId),
    ]);
    await audit("fleet.maintenance.started", "maintenance", id, actor.id, { vehicleId: record.vehicleId }, vtcId);
    return Response.json({ saved: true });
  }
  if (b.action === "completeMaintenance") {
    const id = clean(d.id, 100);
    const record = await db
      .prepare(
        `SELECT m.vehicle_id AS vehicleId,m.cost_cents AS costCents,m.status,
                m.description,v.number,COALESCE(m.mileage,v.mileage) AS mileage
         FROM maintenance_records m
         JOIN vehicles v ON v.id=m.vehicle_id
         LEFT JOIN vehicle_details d ON d.vehicle_id=v.id
         WHERE m.id=? AND v.vtc_id=?`,
      )
      .bind(id, vtcId)
      .first<{
        vehicleId: string;
        costCents: number;
        status: string;
        description: string;
        number: string;
        mileage: number;
      }>();
    if (!record) return apiError("Wartung nicht gefunden", 404);
    await db.batch([
      db
        .prepare(
          `UPDATE maintenance_records SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=? AND vehicle_id IN (SELECT id FROM vehicles WHERE vtc_id=?)`,
        )
        .bind(id, vtcId),
      db
        .prepare(
          `UPDATE vehicles SET status=CASE
             WHEN EXISTS (SELECT 1 FROM maintenance_records m WHERE m.vehicle_id=vehicles.id AND m.status='in_progress') THEN 'maintenance'
             WHEN status='maintenance' THEN 'available' ELSE status END
           WHERE id=(SELECT vehicle_id FROM maintenance_records WHERE id=?)`,
        )
        .bind(id),
      db
        .prepare(
          `UPDATE vehicle_details
           SET next_maintenance_km=?+COALESCE(maintenance_interval_km,30000),
               reliability=MIN(100,reliability+5),updated_at=CURRENT_TIMESTAMP
           WHERE vehicle_id=?`,
        )
        .bind(Math.max(0, Number(record.mileage) || 0), record.vehicleId),
    ]);
    if (record.status !== "completed" && Number(record.costCents) > 0) {
      const existing = await db
        .prepare(
          `SELECT id FROM finance_entries
           WHERE reference_type='fleet_maintenance' AND reference_id=? AND status='posted'`,
        )
        .bind(id)
        .first();
      if (!existing) {
        const accountId = await ensureFinanceAccount(vtcId);
        await db.batch([
          db
            .prepare(
              `INSERT INTO finance_entries
               (id,account_id,amount_cents,category,cost_center,description,reference_type,reference_id,created_by)
               VALUES (?,?,-?,'Wartungskosten','Fuhrpark',?,'fleet_maintenance',?,?)`,
            )
            .bind(
              randomId(),
              accountId,
              Math.round(Number(record.costCents)),
              `${record.number}: ${record.description}`,
              id,
              actor.id,
            ),
          db
            .prepare(`UPDATE finance_accounts SET balance_cents=balance_cents-? WHERE id=?`)
            .bind(Math.round(Number(record.costCents)), accountId),
        ]);
      }
    }
    await audit("fleet.maintenance.completed", "maintenance", id, actor.id, { vehicleId: record.vehicleId }, vtcId);
    return Response.json({ saved: true });
  }
  if (b.action === "reviewReservation") {
    if (!b.reservationId) return apiError("Reservierung fehlt");
    const status = clean(d.status, 20);
    if (!["approved", "rejected", "cancelled"].includes(status))
      return apiError("Ungültiger Status");
    const row = await db
      .prepare(
        `SELECT r.vehicle_id AS vehicleId,r.user_id AS userId,v.status AS vehicleStatus FROM vehicle_reservations r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=? AND v.vtc_id=?`,
      )
      .bind(b.reservationId, vtcId)
      .first<{ vehicleId: string; userId: string; vehicleStatus: string }>();
    if (!row) return apiError("Reservierung nicht gefunden", 404);
    if (status === "approved" && !["available", "reserved"].includes(row.vehicleStatus))
      return apiError("Das Fahrzeug ist wegen seines aktuellen Status nicht reservierbar", 409);
    await db.batch([
      db
        .prepare(
          `UPDATE vehicle_reservations SET status=?,reviewed_by=? WHERE id=?`,
        )
        .bind(status, actor.id, b.reservationId),
      db
        .prepare(
          `UPDATE vehicles SET
             status=CASE
               WHEN ?='approved' THEN 'reserved'
               WHEN status='reserved' AND assigned_user_id=? THEN 'available'
               ELSE status END,
             assigned_user_id=CASE
               WHEN ?='approved' THEN ?
               WHEN status='reserved' AND assigned_user_id=? THEN NULL
               ELSE assigned_user_id END
           WHERE id=?`,
        )
        .bind(status, row.userId, status, row.userId, row.userId, row.vehicleId),
    ]);
    return Response.json({ saved: true });
  }
  if (b.action === "transfer") {
    if (!b.vehicleId || !clean(d.toBranch))
      return apiError("Zielniederlassung erforderlich");
    const current = await db
        .prepare(
          `SELECT d.branch FROM vehicles v LEFT JOIN vehicle_details d ON d.vehicle_id=v.id
           WHERE v.id=? AND v.vtc_id=? AND v.status<>'sold'`,
        )
        .bind(b.vehicleId, vtcId)
        .first<{ branch: string | null }>(),
      id = randomId();
    if (!current) return apiError("Fahrzeug nicht gefunden oder bereits verkauft", 404);
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
          `INSERT INTO vehicle_details (vehicle_id,branch,updated_at)
           VALUES (?,?,CURRENT_TIMESTAMP)
           ON CONFLICT(vehicle_id) DO UPDATE SET branch=excluded.branch,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(b.vehicleId, clean(d.toBranch, 100)),
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

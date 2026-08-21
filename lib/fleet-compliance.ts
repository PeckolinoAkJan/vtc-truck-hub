import { platformEnv, randomId } from "@/lib/platform";

export type FleetAssetPacket = {
  configId?: string;
  brandId?: string;
  brand?: string;
  name?: string;
  licensePlate?: string;
  licenseCountryId?: string;
  bodyType?: string;
  chainType?: string;
};

export type FleetComplianceResult = {
  status: "allowed" | "review" | "blocked";
  allowed: boolean;
  reason: string | null;
  voiceWarning: boolean;
  truck: ResolvedAsset | null;
  trailer: ResolvedAsset | null;
};

type ResolvedAsset = {
  bindingId: string;
  vehicleId: string | null;
  number: string | null;
  status: string | null;
  displayName: string;
  licensePlate: string | null;
  compliance: "allowed" | "review" | "blocked";
  reason: string | null;
};

type Policy = {
  unpairedAction: string;
  maintenanceDueAction: string;
  externalTrailersAllowed: number;
  voiceWarnings: number;
};

const compact = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]/g, "");

const label = (packet: FleetAssetPacket) =>
  [packet.brand, packet.name].filter(Boolean).join(" ").trim() ||
  packet.configId?.trim() ||
  "Unbekanntes Fahrzeug";

async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function hasIdentity(packet?: FleetAssetPacket | null) {
  return Boolean(
    packet &&
      (packet.configId || packet.brandId || packet.name || packet.licensePlate),
  );
}

async function resolveAsset(
  vtcId: string,
  userId: string,
  game: string,
  assetType: "truck" | "trailer",
  packet: FleetAssetPacket,
  odometerKm: number | null,
  policy: Policy,
): Promise<ResolvedAsset> {
  const db = platformEnv().DB;
  const fingerprint = await digest(
    [
      vtcId,
      game,
      assetType,
      compact(packet.configId),
      compact(packet.brandId),
      compact(packet.licensePlate),
      compact(packet.licenseCountryId),
      compact(packet.bodyType),
    ].join("|"),
  );
  let binding = await db
    .prepare(
      `SELECT b.id,b.vehicle_id AS vehicleId,v.number,v.status,v.assigned_user_id AS assignedUserId,
              d.next_maintenance_km AS nextMaintenanceKm
       FROM vehicle_game_bindings b
       LEFT JOIN vehicles v ON v.id=b.vehicle_id AND v.vtc_id=b.vtc_id
       LEFT JOIN vehicle_details d ON d.vehicle_id=v.id
       WHERE b.vtc_id=? AND b.game=? AND b.asset_type=? AND b.fingerprint=? AND b.active=1`,
    )
    .bind(vtcId, game, assetType, fingerprint)
    .first<{
      id: string;
      vehicleId: string | null;
      number: string | null;
      status: string | null;
      assignedUserId: string | null;
      nextMaintenanceKm: number | null;
    }>();

  let automaticVehicleId: string | null = null;
  const normalizedPlate = compact(packet.licensePlate);
  if (!binding?.vehicleId && normalizedPlate) {
    const matches = await db
      .prepare(
        `SELECT id FROM vehicles
         WHERE vtc_id=? AND type=? AND license_plate IS NOT NULL
           AND lower(replace(replace(replace(license_plate,' ',''),'-',''),'.',''))=?
         LIMIT 2`,
      )
      .bind(vtcId, assetType, normalizedPlate)
      .all<{ id: string }>();
    if (matches.results.length === 1) automaticVehicleId = matches.results[0].id;
  }

  const bindingId = binding?.id ?? randomId();
  await db
    .prepare(
      `INSERT INTO vehicle_game_bindings
       (id,vtc_id,vehicle_id,asset_type,game,fingerprint,game_config_id,brand_id,display_name,license_plate,license_country_id,paired_user_id,last_seen_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(vtc_id,game,asset_type,fingerprint) DO UPDATE SET
         vehicle_id=COALESCE(vehicle_game_bindings.vehicle_id,excluded.vehicle_id),
         game_config_id=excluded.game_config_id,brand_id=excluded.brand_id,display_name=excluded.display_name,
         license_plate=excluded.license_plate,license_country_id=excluded.license_country_id,
         paired_user_id=COALESCE(vehicle_game_bindings.paired_user_id,excluded.paired_user_id),
         active=1,last_seen_at=CURRENT_TIMESTAMP`,
    )
    .bind(
      bindingId,
      vtcId,
      automaticVehicleId,
      assetType,
      game,
      fingerprint,
      packet.configId?.slice(0, 160) || null,
      packet.brandId?.slice(0, 120) || null,
      label(packet).slice(0, 200),
      packet.licensePlate?.slice(0, 60) || null,
      packet.licenseCountryId?.slice(0, 60) || null,
      userId,
    )
    .run();

  binding = await db
    .prepare(
      `SELECT b.id,b.vehicle_id AS vehicleId,v.number,v.status,v.assigned_user_id AS assignedUserId,
              d.next_maintenance_km AS nextMaintenanceKm
       FROM vehicle_game_bindings b
       LEFT JOIN vehicles v ON v.id=b.vehicle_id AND v.vtc_id=b.vtc_id
       LEFT JOIN vehicle_details d ON d.vehicle_id=v.id
       WHERE b.vtc_id=? AND b.game=? AND b.asset_type=? AND b.fingerprint=? AND b.active=1`,
    )
    .bind(vtcId, game, assetType, fingerprint)
    .first<{
      id: string;
      vehicleId: string | null;
      number: string | null;
      status: string | null;
      assignedUserId: string | null;
      nextMaintenanceKm: number | null;
    }>();

  if (binding?.vehicleId && odometerKm != null && Number.isFinite(odometerKm))
    await db
      .prepare(`UPDATE vehicles SET mileage=MAX(mileage,?) WHERE id=? AND vtc_id=?`)
      .bind(Math.max(0, odometerKm), binding.vehicleId, vtcId)
      .run();

  let compliance: ResolvedAsset["compliance"] = "allowed";
  let reason: string | null = null;
  if (!binding?.vehicleId) {
    const externalTrailer = assetType === "trailer" && policy.externalTrailersAllowed === 1;
    compliance = externalTrailer
      ? "allowed"
      : policy.unpairedAction === "block"
        ? "blocked"
        : "review";
    reason = externalTrailer
      ? null
      : `${assetType === "truck" ? "LKW" : "Auflieger"} ist noch nicht mit dem Fuhrpark gekoppelt`;
  } else if (["maintenance", "defective", "out_of_service", "sold"].includes(binding.status ?? "")) {
    compliance = "blocked";
    reason = `${binding.number ?? label(packet)} ist ${
      binding.status === "maintenance"
        ? "in Wartung"
        : binding.status === "defective"
          ? "defekt"
          : binding.status === "sold"
            ? "verkauft"
            : "außer Betrieb"
    }`;
  } else if (
    ["reserved", "in_use"].includes(binding.status ?? "") &&
    binding.assignedUserId &&
    binding.assignedUserId !== userId
  ) {
    compliance = "blocked";
    reason = `${binding.number ?? label(packet)} ist einem anderen Fahrer zugewiesen`;
  } else if (
    binding.nextMaintenanceKm != null &&
    odometerKm != null &&
    odometerKm >= binding.nextMaintenanceKm
  ) {
    compliance = policy.maintenanceDueAction === "block" ? "blocked" : "review";
    reason = `${binding.number ?? label(packet)} hat das Wartungsintervall erreicht`;
  }

  return {
    bindingId: binding?.id ?? bindingId,
    vehicleId: binding?.vehicleId ?? null,
    number: binding?.number ?? null,
    status: binding?.status ?? null,
    displayName: label(packet),
    licensePlate: packet.licensePlate?.trim() || null,
    compliance,
    reason,
  };
}

export async function evaluateFleetCompliance(input: {
  vtcId: string;
  userId: string;
  game: string;
  tripId: string;
  truck?: FleetAssetPacket | null;
  trailer?: FleetAssetPacket | null;
  odometerKm?: number | null;
  hasJob: boolean;
}) {
  const db = platformEnv().DB;
  const previousUsage = input.hasJob
    ? await db
        .prepare(
          `SELECT truck_binding_id AS truckBindingId,trailer_binding_id AS trailerBindingId,
                  compliance_status AS complianceStatus
           FROM trip_vehicle_usage WHERE trip_id=? AND vtc_id=?`,
        )
        .bind(input.tripId, input.vtcId)
        .first<{
          truckBindingId: string | null;
          trailerBindingId: string | null;
          complianceStatus: string;
        }>()
    : null;
  const policy =
    (await db
      .prepare(
        `SELECT unpaired_action AS unpairedAction,maintenance_due_action AS maintenanceDueAction,
                external_trailers_allowed AS externalTrailersAllowed,voice_warnings AS voiceWarnings
         FROM fleet_policies WHERE vtc_id=?`,
      )
      .bind(input.vtcId)
      .first<Policy>()) ?? {
      unpairedAction: "review",
      maintenanceDueAction: "warn",
      externalTrailersAllowed: 1,
      voiceWarnings: 1,
    };

  const truck = hasIdentity(input.truck)
    ? await resolveAsset(
        input.vtcId,
        input.userId,
        input.game,
        "truck",
        input.truck!,
        input.odometerKm ?? null,
        policy,
      )
    : null;
  const trailer = hasIdentity(input.trailer)
    ? await resolveAsset(
        input.vtcId,
        input.userId,
        input.game,
        "trailer",
        input.trailer!,
        input.odometerKm ?? null,
        policy,
      )
    : null;
  const assets = [truck, trailer].filter(Boolean) as ResolvedAsset[];
  let status: FleetComplianceResult["status"] = "allowed";
  let reason: string | null = null;
  const blocked = assets.find((asset) => asset.compliance === "blocked");
  const review = assets.find((asset) => asset.compliance === "review");
  if (blocked) {
    status = "blocked";
    reason = blocked.reason;
  } else if (review || (!truck && input.hasJob)) {
    status = "review";
    reason = review?.reason ?? "Der verwendete LKW wurde vom Client noch nicht eindeutig erkannt";
  }
  const switchedAsset =
    previousUsage &&
    previousUsage.complianceStatus !== "blocked" &&
    ((previousUsage.truckBindingId &&
      truck?.bindingId &&
      previousUsage.truckBindingId !== truck.bindingId) ||
      (previousUsage.trailerBindingId &&
        trailer?.bindingId &&
        previousUsage.trailerBindingId !== trailer.bindingId));
  if (status !== "blocked" && switchedAsset) {
    status = "review";
    reason = "Fahrzeug oder Auflieger wurde während der laufenden Fahrt gewechselt";
  }

  if (input.hasJob) {
    await db
      .prepare(
        `INSERT INTO trip_vehicle_usage
         (trip_id,vtc_id,user_id,truck_binding_id,trailer_binding_id,truck_vehicle_id,trailer_vehicle_id,compliance_status,block_reason,first_seen_at,last_seen_at)
         VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT(trip_id) DO UPDATE SET
           truck_binding_id=excluded.truck_binding_id,trailer_binding_id=excluded.trailer_binding_id,
           truck_vehicle_id=excluded.truck_vehicle_id,trailer_vehicle_id=excluded.trailer_vehicle_id,
           compliance_status=excluded.compliance_status,block_reason=excluded.block_reason,last_seen_at=CURRENT_TIMESTAMP`,
      )
      .bind(
        input.tripId,
        input.vtcId,
        input.userId,
        truck?.bindingId ?? null,
        trailer?.bindingId ?? null,
        truck?.vehicleId ?? null,
        trailer?.vehicleId ?? null,
        status,
        reason,
      )
      .run();
  }

  if (status === "blocked" && input.hasJob) {
    const binding = blocked!;
    const existing = await db
      .prepare(
        `SELECT id FROM fleet_incidents
         WHERE vtc_id=? AND user_id=? AND COALESCE(trip_id,'')=? AND COALESCE(binding_id,'')=?
           AND type='vehicle_block' AND resolved_at IS NULL LIMIT 1`,
      )
      .bind(input.vtcId, input.userId, input.tripId, binding.bindingId)
      .first();
    if (!existing)
      await db.batch([
        db
          .prepare(
            `INSERT INTO fleet_incidents
             (id,vtc_id,user_id,trip_id,vehicle_id,binding_id,type,severity,reason,details)
             VALUES (?,?,?,?,?,?,'vehicle_block','critical',?,?)`,
          )
          .bind(
            randomId(),
            input.vtcId,
            input.userId,
            input.tripId,
            binding.vehicleId,
            binding.bindingId,
            reason,
            JSON.stringify({ game: input.game, odometerKm: input.odometerKm }),
          ),
        db
          .prepare(
            `INSERT INTO notifications (id,user_id,type,title,body)
             VALUES (?,?,'fleet.blocked','Fahrzeug nicht einsatzbereit',?)`,
          )
          .bind(
            randomId(),
            input.userId,
            `${reason}. Bitte nutzen Sie ein anderes Fahrzeug oder einen anderen Auflieger.`,
          ),
      ]);
  }

  return {
    status,
    allowed: status !== "blocked",
    reason,
    voiceWarning: policy.voiceWarnings === 1 && status === "blocked",
    truck,
    trailer,
  } satisfies FleetComplianceResult;
}

export async function updateFleetVehicleState(input: {
  result: FleetComplianceResult;
  userId: string;
  hasJob: boolean;
  event: string;
}) {
  const db = platformEnv().DB;
  const vehicleIds = [input.result.truck?.vehicleId, input.result.trailer?.vehicleId]
    .filter((id): id is string => Boolean(id));
  if (!vehicleIds.length || input.result.status === "blocked") return;
  const terminal = ["job.delivered", "job.cancelled"].includes(input.event);
  for (const vehicleId of vehicleIds) {
    if (terminal) {
      await db
        .prepare(
          `UPDATE vehicles
           SET status=CASE WHEN status='in_use' THEN 'available' ELSE status END
           WHERE id=?`,
        )
        .bind(vehicleId)
        .run();
    } else if (input.hasJob && !["game.exited", "client.disconnected"].includes(input.event)) {
      await db
        .prepare(
          `UPDATE vehicles SET status='in_use'
           WHERE id=? AND status IN ('available','reserved','in_use')
             AND (assigned_user_id IS NULL OR assigned_user_id=?)`,
        )
        .bind(vehicleId, input.userId)
        .run();
    }
  }
}

export async function refreshBindingUsage(
  vtcId: string,
  bindingId: string,
  vehicleId: string | null,
) {
  const db = platformEnv().DB;
  const binding = await db
    .prepare(
      `SELECT asset_type AS assetType FROM vehicle_game_bindings
       WHERE id=? AND vtc_id=? AND active=1`,
    )
    .bind(bindingId, vtcId)
    .first<{ assetType: "truck" | "trailer" }>();
  if (!binding) return;
  const rows = await db
    .prepare(
      `SELECT trip_id AS tripId,truck_binding_id AS truckBindingId,
              trailer_binding_id AS trailerBindingId
       FROM trip_vehicle_usage
       WHERE vtc_id=? AND (truck_binding_id=? OR trailer_binding_id=?)`,
    )
    .bind(vtcId, bindingId, bindingId)
    .all<{
      tripId: string;
      truckBindingId: string | null;
      trailerBindingId: string | null;
    }>();
  const policy =
    (await db
      .prepare(
        `SELECT unpaired_action AS unpairedAction,external_trailers_allowed AS externalTrailersAllowed
         FROM fleet_policies WHERE vtc_id=?`,
      )
      .bind(vtcId)
      .first<{ unpairedAction: string; externalTrailersAllowed: number }>()) ?? {
      unpairedAction: "review",
      externalTrailersAllowed: 1,
    };
  for (const row of rows.results) {
    if (binding.assetType === "truck")
      await db
        .prepare(`UPDATE trip_vehicle_usage SET truck_vehicle_id=? WHERE trip_id=?`)
        .bind(vehicleId, row.tripId)
        .run();
    else
      await db
        .prepare(`UPDATE trip_vehicle_usage SET trailer_vehicle_id=? WHERE trip_id=?`)
        .bind(vehicleId, row.tripId)
        .run();

    const usage = await db
      .prepare(
        `SELECT u.truck_binding_id AS truckBindingId,u.trailer_binding_id AS trailerBindingId,
                u.truck_vehicle_id AS truckVehicleId,u.trailer_vehicle_id AS trailerVehicleId,
                tv.number AS truckNumber,tv.status AS truckStatus,
                rv.number AS trailerNumber,rv.status AS trailerStatus
         FROM trip_vehicle_usage u
         LEFT JOIN vehicles tv ON tv.id=u.truck_vehicle_id
         LEFT JOIN vehicles rv ON rv.id=u.trailer_vehicle_id
         WHERE u.trip_id=?`,
      )
      .bind(row.tripId)
      .first<{
        truckBindingId: string | null;
        trailerBindingId: string | null;
        truckVehicleId: string | null;
        trailerVehicleId: string | null;
        truckNumber: string | null;
        truckStatus: string | null;
        trailerNumber: string | null;
        trailerStatus: string | null;
      }>();
    if (!usage) continue;
    const blockedStatus = ["maintenance", "defective", "out_of_service", "sold"];
    const blockedTruck = usage.truckVehicleId && blockedStatus.includes(usage.truckStatus ?? "");
    const blockedTrailer = usage.trailerVehicleId && blockedStatus.includes(usage.trailerStatus ?? "");
    let status = "allowed";
    let reason: string | null = null;
    if (blockedTruck || blockedTrailer) {
      status = "blocked";
      reason = `${blockedTruck ? usage.truckNumber : usage.trailerNumber} ist nicht einsatzbereit`;
    } else if (usage.truckBindingId && !usage.truckVehicleId) {
      status = policy.unpairedAction === "block" ? "blocked" : "review";
      reason = "Der LKW ist noch nicht mit dem Fuhrpark gekoppelt";
    } else if (
      usage.trailerBindingId &&
      !usage.trailerVehicleId &&
      policy.externalTrailersAllowed !== 1
    ) {
      status = policy.unpairedAction === "block" ? "blocked" : "review";
      reason = "Der Auflieger ist noch nicht mit dem Fuhrpark gekoppelt";
    }
    await db
      .prepare(
        `UPDATE trip_vehicle_usage
         SET compliance_status=?,block_reason=?,last_seen_at=CURRENT_TIMESTAMP
         WHERE trip_id=?`,
      )
      .bind(status, reason, row.tripId)
      .run();
  }
}

export async function tripFleetCompliance(tripId: string) {
  return platformEnv().DB.prepare(
    `SELECT compliance_status AS status,block_reason AS reason
     FROM trip_vehicle_usage WHERE trip_id=?`,
  ).bind(tripId).first<{ status: string; reason: string | null }>();
}

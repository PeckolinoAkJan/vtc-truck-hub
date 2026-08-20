import { deliveryMessage, discordRequest } from "@/lib/discord";
import {
  apiError,
  audit,
  ensureDatabase,
  platformEnv,
  randomId,
} from "@/lib/platform";

type Packet = {
  tripId?: string;
  jobKey?: string;
  event?: string;
  hasJob?: boolean;
  vtcId?: string;
  userId?: string;
  game?: string;
  latitude?: number;
  longitude?: number;
  gameX?: number;
  gameY?: number;
  gameZ?: number;
  heading?: number;
  speedKph?: number;
  rpm?: number;
  gear?: number;
  fuelLiters?: number;
  fuelAverage?: number;
  fuelRange?: number;
  odometerKm?: number;
  truckDamage?: number;
  trailerDamage?: number;
  cargoDamage?: number;
  cruiseControl?: boolean;
  engineEnabled?: boolean;
  parkingBrake?: boolean;
  motorBrake?: boolean;
  retarderLevel?: number;
  leftBlinker?: boolean;
  rightBlinker?: boolean;
  hazardWarning?: boolean;
  lowBeam?: boolean;
  highBeam?: boolean;
  beacon?: boolean;
  brakeAirPressure?: number;
  waterTemperature?: number;
  batteryVoltage?: number;
  steeringInput?: number;
  throttleInput?: number;
  brakeInput?: number;
  navigationDistance?: number;
  navigationTime?: number;
  navigationSpeedLimitKph?: number;
  gameTime?: number;
  truck?: string;
  cargo?: string;
  cargoMass?: number;
  sourceCity?: string;
  sourceCompany?: string;
  destinationCity?: string;
  destinationCompany?: string;
  plannedDistanceKm?: number;
  gameIncomeCents?: number;
  server?: string;
  recordedAt?: string;
};
type JobRow = {
  id: string;
  tripId: string;
  status: string;
  startOdometerKm: number | null;
  lastOdometerKm: number | null;
};
type IncidentRow = {
  id: string;
  startedAt: string;
  lastBucket: number;
  points: number;
  peakSpeedKph: number;
};

async function authorized(request: Request) {
  const configuredValue = platformEnv().TELEMETRY_API_KEY?.trim(),
    configured = configuredValue && configuredValue !== "demo-client-key" ? configuredValue : undefined,
    supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied) return null;
  if (configured && supplied === configured) return { vtcId: null, userId: null, keyId: null };
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(supplied))),b=>b.toString(16).padStart(2,"0")).join("");
  const key=await platformEnv().DB.prepare(`SELECT id,vtc_id AS vtcId,user_id AS userId,scopes FROM api_keys WHERE secret_hash=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`).bind(digest).first<{id:string;vtcId:string;userId:string|null;scopes:string}>();
  if(!key)return null;const scopes=JSON.parse(key.scopes||"[]") as string[];
  if(!scopes.includes("telemetry:write"))return null;
  await platformEnv().DB.prepare(`UPDATE api_keys SET last_used_at=CURRENT_TIMESTAMP WHERE id=?`).bind(key.id).run();
  return {vtcId:key.vtcId,userId:key.userId,keyId:key.id};
}
function stableJobKey(p: Packet) {
  return (
    p.jobKey?.trim() ||
    [
      p.game,
      p.sourceCity,
      p.sourceCompany,
      p.destinationCity,
      p.destinationCompany,
      p.cargo,
      Math.round(p.cargoMass ?? 0),
    ]
      .map((x) =>
        String(x ?? "")
          .trim()
          .toLowerCase(),
      )
      .join("|")
  );
}
function pointsForSpeed(
  speed: number,
  rules: { from: number; points: number }[],
) {
  return (
    [...rules].sort((a, b) => b.from - a.from).find((x) => speed >= x.from)
      ?.points ?? 0
  );
}

async function scoreSpeed(p: Packet, tripId: string, recorded: string) {
  const db = platformEnv().DB,
    speed = Math.max(0, p.speedKph ?? 0);
  const settings = await db
    .prepare(
      `SELECT speed_rules AS speedRules FROM economy_settings WHERE active=1 AND (vtc_id=? OR vtc_id IS NULL) ORDER BY vtc_id IS NULL LIMIT 1`,
    )
    .bind(p.vtcId)
    .first<{ speedRules: string }>();
  const rules = JSON.parse(
    settings?.speedRules ??
      '[{"from":95,"points":1},{"from":100,"points":2},{"from":110,"points":3},{"from":120,"points":5},{"from":130,"points":8}]',
  ) as { from: number; points: number }[];
  const open = await db
    .prepare(
      `SELECT id,started_at AS startedAt,last_bucket AS lastBucket,points,peak_speed_kph AS peakSpeedKph FROM speed_incidents WHERE trip_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(tripId)
    .first<IncidentRow>();
  if (speed < 93) {
    if (open)
      await db
        .prepare(
          `UPDATE speed_incidents SET ended_at=?,last_seen_at=? WHERE id=?`,
        )
        .bind(recorded, recorded, open.id)
        .run();
    return { active: false, added: 0, total: 0 };
  }
  if (speed < 95 && !open) return { active: false, added: 0, total: 0 };
  let incident = open;
  if (!incident) {
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO speed_incidents (id,trip_id,user_id,vtc_id,started_at,last_seen_at,peak_speed_kph) VALUES (?,?,?,?,?,?,?)`,
      )
      .bind(id, tripId, p.userId, p.vtcId, recorded, recorded, speed)
      .run();
    incident = {
      id,
      startedAt: recorded,
      lastBucket: -1,
      points: 0,
      peakSpeedKph: speed,
    };
  }
  const elapsed = Math.max(
      0,
      Date.parse(recorded) - Date.parse(incident.startedAt),
    ),
    bucket = elapsed < 3000 ? -1 : Math.floor((elapsed - 3000) / 30000),
    multiplier = pointsForSpeed(speed, rules);
  let added = 0;
  if (bucket > incident.lastBucket && multiplier > 0) {
    const sourceKey = `speed:${incident.id}:${bucket}`,
      insert = await db
        .prepare(
          `INSERT OR IGNORE INTO point_ledger (id,user_id,vtc_id,trip_id,incident_id,delta,reason,status,source_key) VALUES (?,?,?,?,?,?,?,'provisional',?)`,
        )
        .bind(
          randomId(),
          p.userId,
          p.vtcId,
          tripId,
          incident.id,
          multiplier,
          `${speed.toFixed(0)} km/h · 30-Sekunden-Intervall`,
          sourceKey,
        )
        .run();
    if (Number(insert.meta.changes) > 0) added = multiplier;
  }
  const telemetryInsert=await db
    .prepare(
      `UPDATE speed_incidents SET last_seen_at=?,peak_speed_kph=MAX(peak_speed_kph,?),last_bucket=MAX(last_bucket,?),points=points+? WHERE id=?`,
    )
    .bind(recorded, speed, bucket, added, incident.id)
    .run();
  const telemetryId=Number(telemetryInsert.meta.last_row_id??0);
  if(telemetryId>0)await db.batch([
    db.prepare(`INSERT INTO telemetry_details (telemetry_id,vtc_id,user_id,payload,recorded_at) VALUES (?,?,?,?,?)`).bind(telemetryId,p.vtcId,p.userId,JSON.stringify(p),recorded),
    db.prepare(`DELETE FROM telemetry_details WHERE recorded_at<datetime('now','-30 days')`),
  ]);
  return {
    active: speed >= 95,
    added,
    total: incident.points + added,
    incidentId: incident.id,
  };
}

async function notifyDiscordDelivery(tripId: string, vtcId: string) {
  const db = platformEnv().DB,
    trip = await db
      .prepare(
        `SELECT t.id,t.game,t.source_city AS sourceCity,t.destination_city AS destinationCity,t.cargo,t.distance_km AS distanceKm,t.income,t.damage,t.completed_at AS completedAt,u.display_name AS driver,v.name AS vtcName FROM trips t JOIN users u ON u.id=t.user_id JOIN vtcs v ON v.id=t.vtc_id WHERE t.id=? AND t.vtc_id=?`,
      )
      .bind(tripId, vtcId)
      .first<Record<string, unknown>>();
  if (!trip) return;
  const targets = await db
    .prepare(
      `SELECT g.guild_id AS guildId,b.delivery_channel_id AS channelId FROM discord_guilds g JOIN discord_guild_branding b ON b.guild_id=g.guild_id WHERE g.vtc_id=? AND g.enabled=1 AND b.delivery_channel_id IS NOT NULL AND b.delivery_channel_id<>''`,
    )
    .bind(vtcId)
    .all<{ guildId: string; channelId: string }>();
  for (const target of targets.results) {
    const exists = await db
      .prepare(
        `SELECT status FROM discord_delivery_log WHERE trip_id=? AND guild_id=?`,
      )
      .bind(tripId, target.guildId)
      .first<{ status: string }>();
    if (exists?.status === "sent") continue;
    const logId = randomId();
    await db
      .prepare(
        `INSERT INTO discord_delivery_log (id,trip_id,guild_id,channel_id,status) VALUES (?,?,?,?,'pending') ON CONFLICT(trip_id,guild_id) DO UPDATE SET channel_id=excluded.channel_id,status='pending',error=NULL`,
      )
      .bind(logId, tripId, target.guildId, target.channelId)
      .run();
    try {
      const message = await discordRequest<{ id: string }>(
        `/channels/${target.channelId}/messages`,
        { method: "POST", body: JSON.stringify(deliveryMessage(trip)) },
      );
      await db
        .prepare(
          `UPDATE discord_delivery_log SET status='sent',discord_message_id=?,error=NULL WHERE trip_id=? AND guild_id=?`,
        )
        .bind(message?.id ?? null, tripId, target.guildId)
        .run();
      await audit(
        "discord.delivery.sent",
        "trip",
        tripId,
        null,
        { guildId: target.guildId, channelId: target.channelId },
        vtcId,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await db
        .prepare(
          `UPDATE discord_delivery_log SET status='failed',error=? WHERE trip_id=? AND guild_id=?`,
        )
        .bind(detail.slice(0, 500), tripId, target.guildId)
        .run();
      await audit(
        "discord.delivery.failed",
        "trip",
        tripId,
        null,
        {
          guildId: target.guildId,
          channelId: target.channelId,
          error: detail.slice(0, 250),
        },
        vtcId,
      );
    }
  }
}

export async function POST(request: Request) {
  await ensureDatabase();
  const authorization=await authorized(request);
  if (!authorization)
    return apiError("Ungültiger Telemetrie-Schlüssel", 401);
  const p = (await request.json()) as Packet;
  if(authorization.vtcId&&p.vtcId!==authorization.vtcId)return apiError("Der Telemetrie-Schlüssel gehört zu einer anderen Spedition",403);
  if(authorization.userId&&p.userId!==authorization.userId)return apiError("Der Telemetrie-Schlüssel gehört zu einem anderen Benutzerkonto",403);
  if (!p.vtcId || !p.userId || !["ETS2", "ATS"].includes(p.game ?? ""))
    return apiError("vtcId, userId und gültiges Spiel erforderlich");
  if(authorization.userId&&!authorization.vtcId){
    const membership=await platformEnv().DB.prepare(
      `SELECT id FROM memberships WHERE user_id=? AND vtc_id=? AND status='active'`,
    ).bind(authorization.userId,p.vtcId).first<{id:string}>();
    if(!membership)return apiError("Keine aktive Mitgliedschaft für diese Spedition",403);
  }
  if (
    !Number.isFinite(p.latitude) ||
    !Number.isFinite(p.longitude) ||
    Math.abs(p.latitude!) > 90 ||
    Math.abs(p.longitude!) > 180
  )
    return apiError("Ungültige Position");
  if ((p.speedKph ?? 0) > 220)
    return apiError(
      "Auffällige Geschwindigkeit – manuelle Prüfung erforderlich",
      422,
    );
  const db = platformEnv().DB,
    recorded = p.recordedAt ?? new Date().toISOString(),
    jobKey = stableJobKey(p),
    event = p.event ?? "telemetry";
  let job = jobKey.replaceAll("|", "")
    ? await db
        .prepare(
          `SELECT id,trip_id AS tripId,status,start_odometer_km AS startOdometerKm,last_odometer_km AS lastOdometerKm FROM trip_jobs WHERE vtc_id=? AND user_id=? AND game=? AND job_key=?`,
        )
        .bind(p.vtcId, p.userId, p.game, jobKey)
        .first<JobRow>()
    : null;
  let tripId = job?.tripId ?? p.tripId ?? randomId(),
    lifecycle = "active",
    deliveredNow = false;
  const hasJob =
    p.hasJob !== false &&
    Boolean(p.cargo || p.sourceCity || p.destinationCity || p.jobKey);
  if (hasJob && !job) {
    const jobId = randomId();
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO trips (id,vtc_id,user_id,game,source_city,destination_city,cargo,status,started_at) VALUES (?,?,?,?,?,?,?,'started',?)`,
        )
        .bind(
          tripId,
          p.vtcId,
          p.userId,
          p.game,
          p.sourceCity ?? null,
          p.destinationCity ?? null,
          p.cargo ?? null,
          recorded,
        ),
      db
        .prepare(
          `INSERT INTO trip_jobs (id,trip_id,vtc_id,user_id,game,job_key,status,source_city,source_company,destination_city,destination_company,cargo,cargo_mass,planned_distance_km,game_income_cents,start_odometer_km,last_odometer_km,accepted_at,last_seen_at) VALUES (?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          jobId,
          tripId,
          p.vtcId,
          p.userId,
          p.game,
          jobKey,
          p.sourceCity ?? null,
          p.sourceCompany ?? null,
          p.destinationCity ?? null,
          p.destinationCompany ?? null,
          p.cargo ?? null,
          p.cargoMass ?? null,
          p.plannedDistanceKm ?? null,
          p.gameIncomeCents ?? 0,
          p.odometerKm ?? null,
          p.odometerKm ?? null,
          recorded,
          recorded,
        ),
    ]);
    job = {
      id: jobId,
      tripId,
      status: "active",
      startOdometerKm: p.odometerKm ?? null,
      lastOdometerKm: p.odometerKm ?? null,
    };
    const dispatch = await db
      .prepare(
        `SELECT id FROM dispatch_orders WHERE vtc_id=? AND assigned_user_id=? AND game=? AND status IN ('accepted','assigned','reserved') AND lower(source_city)=lower(?) AND lower(destination_city)=lower(?) AND (lower(cargo)=lower(?) OR cargo='*') ORDER BY status='accepted' DESC,created_at LIMIT 1`,
      )
      .bind(
        p.vtcId,
        p.userId,
        p.game,
        p.sourceCity ?? "",
        p.destinationCity ?? "",
        p.cargo ?? "",
      )
      .first<{ id: string }>();
    if (dispatch)
      await db.batch([
        db
          .prepare(
            `UPDATE dispatch_orders SET status='started',trip_id=?,assigned_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          )
          .bind(tripId, p.userId, dispatch.id),
        db
          .prepare(
            `INSERT INTO dispatch_history (id,order_id,actor_id,action,detail) VALUES (?,?,?,'started',?)`,
          )
          .bind(
            randomId(),
            dispatch.id,
            p.userId,
            JSON.stringify({ tripId, jobKey }),
          ),
      ]);
    await audit(
      "trip.created",
      "trip",
      tripId,
      p.userId,
      { jobKey, event, dispatchOrderId: dispatch?.id },
      p.vtcId,
    );
  }
  if (job) {
    tripId = job.tripId;
    const distance = Math.max(
      0,
      (p.odometerKm ?? job.lastOdometerKm ?? job.startOdometerKm ?? 0) -
        (job.startOdometerKm ?? p.odometerKm ?? 0),
    );
    if (event === "job.cancelled") {
      lifecycle = "cancelled";
      await db.batch([
        db
          .prepare(
            `UPDATE trip_jobs SET status='cancelled',cancelled_at=?,last_seen_at=? WHERE id=?`,
          )
          .bind(recorded, recorded, job.id),
        db
          .prepare(
            `UPDATE trips SET status='cancelled',completed_at=?,distance_km=?,damage=MAX(damage,?) WHERE id=?`,
          )
          .bind(
            recorded,
            distance,
            Math.max(p.truckDamage ?? 0, p.trailerDamage ?? 0) * 100,
            tripId,
          ),
        db
          .prepare(
            `INSERT OR IGNORE INTO trip_reviews (id,trip_id,status,reason) VALUES (?,?,'cancelled','Auftrag im Spiel abgebrochen')`,
          )
          .bind(randomId(), tripId),
        db
          .prepare(
            `UPDATE point_ledger SET status='active' WHERE trip_id=? AND status='provisional'`,
          )
          .bind(tripId),
        db
          .prepare(
            `UPDATE dispatch_orders SET status='aborted',updated_at=CURRENT_TIMESTAMP WHERE trip_id=? AND status='started'`,
          )
          .bind(tripId),
        db
          .prepare(
            `INSERT INTO dispatch_history (id,order_id,actor_id,action,detail) SELECT ?,id,?,'aborted',? FROM dispatch_orders WHERE trip_id=?`,
          )
          .bind(randomId(), p.userId, JSON.stringify({ tripId }), tripId),
      ]);
    } else if (event === "job.delivered") {
      lifecycle = "pending_driver";
      deliveredNow = job.status !== "delivered";
      await db.batch([
        db
          .prepare(
            `UPDATE trip_jobs SET status='delivered',delivered_at=?,last_seen_at=?,last_odometer_km=? WHERE id=?`,
          )
          .bind(recorded, recorded, p.odometerKm ?? null, job.id),
        db
          .prepare(
            `UPDATE trips SET status='pending_driver',completed_at=?,distance_km=?,income=?,damage=MAX(damage,?) WHERE id=?`,
          )
          .bind(
            recorded,
            distance,
            (p.gameIncomeCents ?? 0) / 100,
            Math.max(p.truckDamage ?? 0, p.trailerDamage ?? 0) * 100,
            tripId,
          ),
        db
          .prepare(
            `INSERT OR IGNORE INTO trip_reviews (id,trip_id,status) VALUES (?,?,'pending_driver')`,
          )
          .bind(randomId(), tripId),
        db
          .prepare(
            `UPDATE dispatch_orders SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE trip_id=? AND status='started'`,
          )
          .bind(tripId),
        db
          .prepare(
            `INSERT INTO dispatch_history (id,order_id,actor_id,action,detail) SELECT ?,id,?,'completed',? FROM dispatch_orders WHERE trip_id=?`,
          )
          .bind(
            randomId(),
            p.userId,
            JSON.stringify({ tripId, distance }),
            tripId,
          ),
      ]);
    } else if (event === "game.exited" || event === "client.disconnected") {
      lifecycle = "interrupted";
      await db.batch([
        db
          .prepare(
            `UPDATE trip_jobs SET status='interrupted',interrupted_at=?,last_seen_at=?,last_odometer_km=? WHERE id=? AND status IN ('active','interrupted')`,
          )
          .bind(recorded, recorded, p.odometerKm ?? null, job.id),
        db
          .prepare(
            `UPDATE trips SET status='interrupted' WHERE id=? AND status IN ('started','interrupted')`,
          )
          .bind(tripId),
      ]);
    } else {
      lifecycle = job.status === "interrupted" ? "resumed" : "active";
      await db.batch([
        db
          .prepare(
            `UPDATE trip_jobs SET status='active',interrupted_at=NULL,last_seen_at=?,last_odometer_km=? WHERE id=? AND status IN ('active','interrupted')`,
          )
          .bind(recorded, p.odometerKm ?? null, job.id),
        db
          .prepare(
            `UPDATE trips SET status='started',distance_km=?,damage=MAX(damage,?) WHERE id=? AND status IN ('started','interrupted')`,
          )
          .bind(
            distance,
            Math.max(p.truckDamage ?? 0, p.trailerDamage ?? 0) * 100,
            tripId,
          ),
      ]);
    }
  }
  await db
    .prepare(
      `INSERT INTO telemetry (trip_id,vtc_id,user_id,game,latitude,longitude,heading,speed_kph,rpm,fuel_liters,truck,cargo,source_city,destination_city,server,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      tripId,
      p.vtcId,
      p.userId,
      p.game,
      p.latitude,
      p.longitude,
      p.heading ?? 0,
      p.speedKph ?? 0,
      p.rpm ?? null,
      p.fuelLiters ?? null,
      p.truck ?? null,
      p.cargo ?? null,
      p.sourceCity ?? null,
      p.destinationCity ?? null,
      p.server ?? null,
      recorded,
    )
    .run();
  if (deliveredNow) await notifyDiscordDelivery(tripId, p.vtcId);
  const points =
    job && !["cancelled", "pending_driver"].includes(lifecycle)
      ? await scoreSpeed(p, tripId, recorded)
      : { active: false, added: 0, total: 0 };
  await audit(
    `telemetry.${event}`,
    "trip",
    tripId,
    p.userId,
    {
      speedKph: p.speedKph,
      game: p.game,
      lifecycle,
      pointsAdded: points.added,
      vehicleState: {
        gear: p.gear,
        cruiseControl: p.cruiseControl,
        engineEnabled: p.engineEnabled,
        parkingBrake: p.parkingBrake,
        motorBrake: p.motorBrake,
        retarderLevel: p.retarderLevel,
        leftBlinker: p.leftBlinker,
        rightBlinker: p.rightBlinker,
        hazardWarning: p.hazardWarning,
        lowBeam: p.lowBeam,
        highBeam: p.highBeam,
        beacon: p.beacon,
      },
      navigation: {distance: p.navigationDistance,time: p.navigationTime,speedLimitKph: p.navigationSpeedLimitKph},
      systems: {brakeAirPressure: p.brakeAirPressure,waterTemperature: p.waterTemperature,batteryVoltage: p.batteryVoltage},
    },
    p.vtcId,
  );
  return Response.json(
    { accepted: true, tripId, jobKey, lifecycle, points, recordedAt: recorded },
    { status: 202 },
  );
}

export async function GET(request: Request) {
  await ensureDatabase();
  const authorization=await authorized(request);
  if (!authorization)
    return apiError("Ungültiger Telemetrie-Schlüssel", 401);
  const rows = authorization.vtcId
    ? await platformEnv().DB.prepare(`SELECT * FROM telemetry WHERE vtc_id=? ORDER BY recorded_at DESC LIMIT 100`).bind(authorization.vtcId).all()
    : authorization.userId
      ? await platformEnv().DB.prepare(`SELECT * FROM telemetry WHERE user_id=? ORDER BY recorded_at DESC LIMIT 100`).bind(authorization.userId).all()
      : await platformEnv().DB.prepare(`SELECT * FROM telemetry ORDER BY recorded_at DESC LIMIT 100`).all();
  return Response.json({ data: rows.results });
}

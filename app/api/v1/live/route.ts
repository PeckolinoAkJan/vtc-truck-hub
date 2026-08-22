import { ensureDatabase, getSessionUser, platformEnv } from "@/lib/platform";

type LiveRow = Record<string, unknown> & {
  userId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
};

type TrailRow = {
  userId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
};

type PublicLiveRow = {
  userId: string;
  vtcId: string;
  vtcName: string | null;
  game: string;
  latitude: number | null;
  longitude: number | null;
  gameX: number;
  gameY: number | null;
  gameZ: number;
  coordinateAccuracy: string | null;
  projectionProfile: string | null;
  heading: number;
  speedKph: number;
  recordedAt: string;
};

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

const jsonResponse = (body: unknown) =>
  Response.json(body, { headers: responseHeaders });

const ageSeconds = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.round((Date.now() - timestamp) / 1000))
    : 999999;
};

const connectionStatus = (age: number) =>
  age <= 20 ? "live" : age <= 90 ? "delayed" : "offline";

function buildTrails(rows: TrailRow[]) {
  const grouped: Record<string, Array<{ latitude: number; longitude: number; recordedAt: string }>> = {};
  for (const row of [...rows].reverse()) {
    const trail = grouped[row.userId] ?? [];
    if (trail.length >= 60) continue;
    const previous = trail.at(-1);
    if (
      previous &&
      Math.abs(previous.latitude - Number(row.latitude)) < 0.00001 &&
      Math.abs(previous.longitude - Number(row.longitude)) < 0.00001
    ) continue;
    trail.push({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      recordedAt: row.recordedAt,
    });
    grouped[row.userId] = trail;
  }
  return grouped;
}

export async function GET(request: Request) {
  await ensureDatabase();
  const db = platformEnv().DB;
  const user = await getSessionUser(request);
  const memberships = user
    ? await db.prepare(
        `SELECT vtc_id AS vtcId FROM memberships WHERE user_id=? AND status='active'`,
      ).bind(user.id).all<{ vtcId: string }>()
    : { results: [] as { vtcId: string }[] };
  const internal = Boolean(user && memberships.results.length);

  if (internal && user) {
    const rows = await db.prepare(
      `SELECT lp.user_id AS userId,COALESCE(u.display_name,lp.user_id) AS driverName,
        lp.vtc_id AS vtcId,v.name AS vtcName,lp.trip_id AS tripId,lp.game,
        lp.latitude,lp.longitude,lp.game_x AS gameX,lp.game_y AS gameY,lp.game_z AS gameZ,
        lp.coordinate_accuracy AS coordinateAccuracy,lp.projection_profile AS projectionProfile,
        lp.heading,lp.speed_kph AS speedKph,lp.truck,lp.cargo,
        lp.source_city AS sourceCity,lp.destination_city AS destinationCity,
        lp.server,lp.updated_at AS recordedAt
       FROM live_positions lp
       JOIN memberships viewer ON viewer.vtc_id=lp.vtc_id AND viewer.user_id=? AND viewer.status='active'
       LEFT JOIN live_map_preferences driver_pref ON driver_pref.user_id=lp.user_id
       LEFT JOIN users u ON u.id=lp.user_id
       LEFT JOIN vtcs v ON v.id=lp.vtc_id
       WHERE lp.active=1 AND COALESCE(driver_pref.show_exact_to_vtc,1)=1
         AND datetime(lp.updated_at)>datetime('now','-5 minutes')
       ORDER BY lp.updated_at DESC`,
    ).bind(user.id).all<LiveRow>();

    const trailRows = await db.prepare(
      `SELECT t.user_id AS userId,t.latitude,t.longitude,t.recorded_at AS recordedAt
       FROM telemetry t
       JOIN live_positions lp ON lp.user_id=t.user_id AND lp.vtc_id=t.vtc_id AND lp.active=1
       JOIN memberships viewer ON viewer.vtc_id=t.vtc_id AND viewer.user_id=? AND viewer.status='active'
       LEFT JOIN live_map_preferences driver_pref ON driver_pref.user_id=t.user_id
       WHERE COALESCE(driver_pref.show_exact_to_vtc,1)=1
         AND datetime(lp.updated_at)>datetime('now','-5 minutes')
         AND datetime(t.recorded_at)>datetime('now','-30 minutes')
       ORDER BY t.recorded_at DESC LIMIT 2400`,
    ).bind(user.id).all<TrailRow>();

    const data = rows.results.map((row) => {
      const age = ageSeconds(row.recordedAt);
      return { ...row, ageSeconds: age, connectionStatus: connectionStatus(age) };
    });
    return jsonResponse({
      data,
      trails: buildTrails(trailRows.results),
      meta: {
        displayed: data.length,
        privacy: "internal-exact",
        delayMinutes: 0,
        pollIntervalMs: 3000,
        staleAfterSeconds: 20,
        removeAfterSeconds: 300,
      },
    });
  }

  const rows = await db.prepare(
    `SELECT lp.user_id AS userId,lp.vtc_id AS vtcId,v.name AS vtcName,lp.game,
       lp.latitude,lp.longitude,lp.game_x AS gameX,lp.game_y AS gameY,lp.game_z AS gameZ,
       lp.coordinate_accuracy AS coordinateAccuracy,lp.projection_profile AS projectionProfile,
       lp.heading,lp.speed_kph AS speedKph,lp.updated_at AS recordedAt
     FROM live_positions lp
     LEFT JOIN live_map_preferences pref ON pref.user_id=lp.user_id
     LEFT JOIN vtcs v ON v.id=lp.vtc_id
     WHERE lp.active=1
       AND COALESCE(pref.public_visible,1)=1
       AND lp.game_x IS NOT NULL
       AND lp.game_z IS NOT NULL
       AND datetime(lp.updated_at)>datetime('now','-15 seconds')
     ORDER BY lp.user_id`,
  ).all<PublicLiveRow>();
  const data = rows.results.map((row, index) => {
    const age = ageSeconds(row.recordedAt);
    return {
      userId: `Fahrer ${String(index + 1).padStart(2, "0")}`,
      driverName: `Fahrer ${String(index + 1).padStart(2, "0")}`,
      vtcId: row.vtcId,
      vtcName: row.vtcName,
      game: row.game,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      gameX: Number(row.gameX),
      gameY: row.gameY == null ? null : Number(row.gameY),
      gameZ: Number(row.gameZ),
      heading: Number(row.heading),
      speedKph: Math.round(Number(row.speedKph) / 10) * 10,
      recordedAt: row.recordedAt,
      coordinateAccuracy: row.coordinateAccuracy ?? "raw-scs-public",
      projectionProfile: row.projectionProfile,
      connectionStatus: connectionStatus(age),
      ageSeconds: age,
    };
  });
  return jsonResponse({
    data,
    trails: {},
    meta: {
      displayed: data.length,
      privacy: "public-near-real-time-anonymized",
      delayMinutes: 0,
      pollIntervalMs: 3000,
      staleAfterSeconds: 15,
      removeAfterSeconds: 15,
    },
  });
}

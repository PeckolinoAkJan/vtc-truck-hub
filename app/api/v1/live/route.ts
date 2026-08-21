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
       JOIN memberships viewer ON viewer.vtc_id=t.vtc_id AND viewer.user_id=? AND viewer.status='active'
       WHERE datetime(t.recorded_at)>datetime('now','-30 minutes')
       ORDER BY t.recorded_at DESC LIMIT 2400`,
    ).bind(user.id).all<TrailRow>();

    const data = rows.results.map((row) => {
      const age = ageSeconds(row.recordedAt);
      return { ...row, ageSeconds: age, connectionStatus: connectionStatus(age) };
    });
    return Response.json({
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
    `SELECT t.user_id AS userId,t.vtc_id AS vtcId,v.name AS vtcName,t.game,
      t.latitude,t.longitude,t.heading,t.speed_kph AS speedKph,t.truck,
      t.source_city AS sourceCity,t.destination_city AS destinationCity,t.recorded_at AS recordedAt
     FROM telemetry t
     LEFT JOIN vtcs v ON v.id=t.vtc_id
     LEFT JOIN live_map_preferences pref ON pref.user_id=t.user_id
     JOIN (
       SELECT delayed.user_id,MAX(delayed.recorded_at) AS latest
       FROM telemetry delayed
       LEFT JOIN live_map_preferences delayed_pref ON delayed_pref.user_id=delayed.user_id
       WHERE datetime(delayed.recorded_at)<datetime('now','-10 minutes')
         AND datetime(delayed.recorded_at)>datetime('now','-25 minutes')
         AND COALESCE(delayed_pref.public_visible,1)=1
       GROUP BY delayed.user_id
     ) latest ON latest.user_id=t.user_id AND latest.latest=t.recorded_at
     WHERE COALESCE(pref.public_visible,1)=1
     ORDER BY t.recorded_at DESC`,
  ).all<LiveRow>();
  const data = rows.results.map((row, index) => ({
    ...row,
    userId: `Fahrer ${String(index + 1).padStart(2, "0")}`,
    driverName: `Fahrer ${String(index + 1).padStart(2, "0")}`,
    latitude: Math.round(Number(row.latitude) * 10) / 10,
    longitude: Math.round(Number(row.longitude) * 10) / 10,
    cargo: undefined,
    server: undefined,
    coordinateAccuracy: "privacy-rounded",
    connectionStatus: "delayed",
    ageSeconds: ageSeconds(row.recordedAt),
  }));
  return Response.json({
    data,
    trails: {},
    meta: {
      displayed: data.length,
      privacy: "public-delayed-and-rounded",
      delayMinutes: 10,
      pollIntervalMs: 15000,
      staleAfterSeconds: 1200,
      removeAfterSeconds: 1500,
    },
  });
}

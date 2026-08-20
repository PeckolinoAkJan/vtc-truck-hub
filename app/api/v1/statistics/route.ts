import {
  apiError,
  ensureDatabase,
  getSessionUser,
  platformEnv,
  randomId,
  requireVtcPermission,
} from "@/lib/platform";
type Body = { action?: string; vtcId?: string; data?: Record<string, unknown> };
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
  if (!member) return apiError("Keine aktive Mitgliedschaft", 403);
  const defaults = [
    [
      "first_job",
      "Erste Lieferung",
      "Den ersten Auftrag erfolgreich abschließen",
      "🚚",
      100,
      '{"trips":1}',
    ],
    [
      "ten_thousand",
      "Fernfahrer",
      "10.000 Kilometer für die Spedition fahren",
      "🛣️",
      500,
      '{"km":10000}',
    ],
    [
      "safe_fifty",
      "Sicherheitsprofi",
      "50 Fahrten mit unter 1 % Durchschnittsschaden",
      "🛡️",
      1000,
      '{"trips":50,"damage":1}',
    ],
  ];
  await db.batch(
    defaults.map((a) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO achievements (id,code,title,description,icon,xp_reward,criteria) VALUES (?,?,?,?,?,?,?)`,
        )
        .bind(`achievement-${a[0]}`, ...a),
    ),
  );
  const stats = await db
      .prepare(
        `SELECT COUNT(*) trips,COALESCE(SUM(distance_km),0) km,COALESCE(SUM(fuel_liters),0) fuel,COALESCE(AVG(damage),0) damage,COALESCE(SUM(income),0) income,COALESCE(AVG(CASE WHEN distance_km>0 THEN fuel_liters*100.0/distance_km END),0) consumption,COALESCE(SUM(CASE WHEN game='ETS2' THEN distance_km ELSE 0 END),0) ets2Km,COALESCE(SUM(CASE WHEN game='ATS' THEN distance_km ELSE 0 END),0) atsKm,COALESCE(SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END),0) cancelled FROM trips WHERE vtc_id=? AND user_id=?`,
      )
      .bind(vtcId, user.id)
      .first<any>(),
    activePoints =
      (
        await db
          .prepare(
            `SELECT COALESCE(SUM(delta),0) points FROM point_ledger WHERE vtc_id=? AND user_id=? AND status='active'`,
          )
          .bind(vtcId, user.id)
          .first<any>()
      )?.points ?? 0,
    awards: string[] = [];
  if (stats.trips >= 1) awards.push("achievement-first_job");
  if (stats.km >= 10000) awards.push("achievement-ten_thousand");
  if (stats.trips >= 50 && stats.damage < 1)
    awards.push("achievement-safe_fifty");
  for (const id of awards)
    await db
      .prepare(
        `INSERT OR IGNORE INTO user_achievements (id,user_id,vtc_id,achievement_id) VALUES (?,?,?,?)`,
      )
      .bind(randomId(), user.id, vtcId, id)
      .run();
  const reward = await db
      .prepare(
        `SELECT COALESCE(SUM(a.xp_reward),0) xp FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=? AND ua.vtc_id=?`,
      )
      .bind(user.id, vtcId)
      .first<any>(),
    xp =
      Math.floor(Number(stats.km) / 10) +
      Number(stats.trips) * 100 +
      Number(reward?.xp ?? 0),
    level = Math.max(1, Math.floor(Math.sqrt(xp / 500)) + 1),
    safety = Math.max(
      0,
      100 - Number(stats.damage) * 8 - Math.max(0, Number(activePoints)) * 2,
    ),
    efficiency = Math.max(0, Math.min(100, 110 - Number(stats.consumption))),
    reliability = Math.max(
      0,
      100 - (Number(stats.cancelled) / Math.max(1, Number(stats.trips))) * 100,
    );
  await db
    .prepare(
      `INSERT INTO career_profiles (id,vtc_id,user_id,xp,level,safety_score,efficiency_score,reliability_score,streak_days,updated_at) VALUES (?,?,?,?,?,?,?,?,0,CURRENT_TIMESTAMP) ON CONFLICT(vtc_id,user_id) DO UPDATE SET xp=excluded.xp,level=excluded.level,safety_score=excluded.safety_score,efficiency_score=excluded.efficiency_score,reliability_score=excluded.reliability_score,updated_at=CURRENT_TIMESTAMP`,
    )
    .bind(
      randomId(),
      vtcId,
      user.id,
      xp,
      level,
      safety,
      efficiency,
      reliability,
    )
    .run();
  const [
    career,
    achievements,
    leaderboard,
    monthly,
    company,
    challenges,
    hall,
  ] = await Promise.all([
    db
      .prepare(`SELECT * FROM career_profiles WHERE vtc_id=? AND user_id=?`)
      .bind(vtcId, user.id)
      .first(),
    db
      .prepare(
        `SELECT a.*,ua.awarded_at AS awardedAt FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=? AND ua.vtc_id=? ORDER BY ua.awarded_at IS NULL,a.xp_reward`,
      )
      .bind(user.id, vtcId)
      .all(),
    db
      .prepare(
        `SELECT u.display_name AS driver,m.driver_number,c.xp,c.level,c.safety_score,c.efficiency_score,c.reliability_score,COALESCE(SUM(t.distance_km),0) km,COUNT(t.id) trips FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN career_profiles c ON c.user_id=m.user_id AND c.vtc_id=m.vtc_id LEFT JOIN trips t ON t.user_id=m.user_id AND t.vtc_id=m.vtc_id WHERE m.vtc_id=? AND m.status IN ('active','probation') GROUP BY m.user_id ORDER BY km DESC LIMIT 100`,
      )
      .bind(vtcId)
      .all(),
    db
      .prepare(
        `SELECT substr(started_at,1,7) month,COUNT(*) trips,COALESCE(SUM(distance_km),0) km,COALESCE(SUM(income),0) income,COALESCE(AVG(damage),0) damage,COALESCE(AVG(CASE WHEN distance_km>0 THEN fuel_liters*100.0/distance_km END),0) consumption FROM trips WHERE vtc_id=? GROUP BY substr(started_at,1,7) ORDER BY month DESC LIMIT 24`,
      )
      .bind(vtcId)
      .all(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT m.user_id) drivers,COUNT(DISTINCT CASE WHEN m.status IN ('active','probation') THEN m.user_id END) activeDrivers,COUNT(t.id) trips,COALESCE(SUM(t.distance_km),0) km,COALESCE(SUM(t.income),0) revenue,COALESCE(AVG(t.damage),0) damage,COUNT(DISTINCT v.id) fleet FROM memberships m LEFT JOIN trips t ON t.vtc_id=m.vtc_id LEFT JOIN vehicles v ON v.vtc_id=m.vtc_id WHERE m.vtc_id=?`,
      )
      .bind(vtcId)
      .first(),
    db
      .prepare(
        `SELECT c.*,COALESCE(p.value,0) progress,p.completed_at AS completedAt,p.rewarded_at AS rewardedAt FROM challenges c LEFT JOIN challenge_progress p ON p.challenge_id=c.id AND p.user_id=? WHERE c.active=1 AND (c.vtc_id=? OR c.vtc_id IS NULL) ORDER BY c.ends_at`,
      )
      .bind(user.id, vtcId)
      .all(),
    db
      .prepare(
        `SELECT u.display_name AS driver,a.title,a.icon,ua.awarded_at AS awardedAt FROM user_achievements ua JOIN users u ON u.id=ua.user_id JOIN achievements a ON a.id=ua.achievement_id WHERE ua.vtc_id=? ORDER BY ua.awarded_at DESC LIMIT 100`,
      )
      .bind(vtcId)
      .all(),
  ]);
  return Response.json({
    stats: { ...stats, activePoints },
    career,
    achievements: achievements.results,
    leaderboard: leaderboard.results,
    monthly: monthly.results,
    company,
    challenges: challenges.results,
    hall: hall.results,
    canManage: Boolean(
      await requireVtcPermission(request, vtcId, "manage_settings"),
    ),
  });
}
export async function POST(request: Request) {
  await ensureDatabase();
  const b = (await request.json()) as Body,
    vtcId = (await resolveVtcId(request,b.vtcId)) ?? "",
    actor = await requireVtcPermission(request, vtcId, "manage_settings");
  if (!actor) return apiError("Einstellungsrecht erforderlich", 403);
  const d = b.data ?? {};
  if (b.action === "challenge") {
    const id = randomId(),
      name = clean(d.name, 120),
      metric = clean(d.metric, 30);
    if (!name || !metric || !Number(d.target) || !clean(d.endsAt, 30))
      return apiError("Name, Zielwert, Metrik und Ende sind Pflicht");
    await platformEnv()
      .DB.prepare(
        `INSERT INTO challenges (id,vtc_id,name,description,metric,target,starts_at,ends_at,xp_reward,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        vtcId,
        name,
        clean(d.description, 1000) || null,
        metric,
        Number(d.target),
        clean(d.startsAt, 30) || new Date().toISOString(),
        clean(d.endsAt, 30),
        Math.round(Number(d.xpReward) || 0),
        actor.id,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  return apiError("Ungültige Statistikaktion");
}
import {resolveVtcId} from "@/lib/platform";

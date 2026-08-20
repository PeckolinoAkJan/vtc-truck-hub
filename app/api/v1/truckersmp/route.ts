import {
  apiError,
  ensureDatabase,
  getSessionUser,
  platformEnv,
  randomId,
  requireVtcPermission,
} from "@/lib/platform";
type Body = {
  action?: string;
  vtcId?: string;
  truckersmpId?: string;
  linkId?: string;
  type?: string;
};
const clean = (v: unknown, n = 100) =>
    String(v ?? "")
      .trim()
      .slice(0, n),
  base = "https://api.truckersmp.com/v2";
export async function GET(request: Request) {
  await ensureDatabase();
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const db = platformEnv().DB,
    url = new URL(request.url),
    vtcId = (await resolveVtcId(request,url.searchParams.get("vtcId"))) ?? "",
    member = await db
      .prepare(`SELECT id FROM memberships WHERE vtc_id=? AND user_id=?`)
      .bind(vtcId, user.id)
      .first();
  if (!member) return apiError("Keine Mitgliedschaft", 403);
  const [links, logs] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM truckersmp_links WHERE vtc_id=? OR user_id=? ORDER BY type,last_synced_at DESC`,
      )
      .bind(vtcId, user.id)
      .all(),
    db
      .prepare(
        `SELECT l.* FROM truckersmp_sync_logs l JOIN truckersmp_links k ON k.id=l.link_id WHERE k.vtc_id=? OR k.user_id=? ORDER BY l.created_at DESC LIMIT 100`,
      )
      .bind(vtcId, user.id)
      .all(),
  ]);
  let servers: any = { response: [], error: null };
  try {
    servers = await tmpFetch(`${base}/servers`);
  } catch (e) {
    servers = {
      response: [],
      error: e instanceof Error ? e.message : "TruckersMP nicht erreichbar",
    };
  }
  return Response.json({
    canManage: Boolean(
      await requireVtcPermission(request, vtcId, "manage_settings"),
    ),
    links: (links.results as any[]).map((x) => ({
      ...x,
      remote_data: parse(x.remote_data, {}),
    })),
    logs: logs.results,
    servers: servers.response ?? servers,
    serverError: servers.error ?? null,
  });
}
export async function POST(request: Request) {
  await ensureDatabase();
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const b = (await request.json()) as Body,
    db = platformEnv().DB,
    vtcId = (await resolveVtcId(request,b.vtcId)) ?? "";
  if (b.action === "link") {
    const type = b.type === "vtc" ? "vtc" : "player",
      id = clean(b.truckersmpId);
    if (!/^\d+$/.test(id)) return apiError("TruckersMP-ID muss numerisch sein");
    if (
      type === "vtc" &&
      !(await requireVtcPermission(request, vtcId, "manage_settings"))
    )
      return apiError("Einstellungsrecht erforderlich", 403);
    const linkId = randomId();
    await db
      .prepare(
        `INSERT INTO truckersmp_links (id,user_id,vtc_id,truckersmp_id,type) VALUES (?,?,?,?,?) ON CONFLICT(type,truckersmp_id) DO UPDATE SET user_id=excluded.user_id,vtc_id=excluded.vtc_id,updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(linkId, type === "player" ? user.id : null, vtcId, id, type)
      .run();
    const row = await db
      .prepare(
        `SELECT id FROM truckersmp_links WHERE type=? AND truckersmp_id=?`,
      )
      .bind(type, id)
      .first<any>();
    return sync(row?.id || linkId, user.id);
  }
  if (b.action === "sync" && b.linkId) {
    const link = await db
      .prepare(
        `SELECT * FROM truckersmp_links WHERE id=? AND (user_id=? OR vtc_id=?)`,
      )
      .bind(b.linkId, user.id, vtcId)
      .first<any>();
    if (!link) return apiError("Verknüpfung nicht gefunden", 404);
    if (
      link.type === "vtc" &&
      !(await requireVtcPermission(request, vtcId, "manage_settings"))
    )
      return apiError("Einstellungsrecht erforderlich", 403);
    return sync(link.id, user.id);
  }
  return apiError("Ungültige TruckersMP-Aktion");
}
async function sync(linkId: string, actorId: string) {
  const db = platformEnv().DB,
    link = await db
      .prepare(`SELECT * FROM truckersmp_links WHERE id=?`)
      .bind(linkId)
      .first<any>();
  if (!link) return apiError("Verknüpfung nicht gefunden", 404);
  try {
    const endpoint =
        link.type === "player"
          ? `${base}/player/${link.truckersmp_id}`
          : `${base}/vtc/${link.truckersmp_id}`,
      data = await tmpFetch(endpoint),
      payload = data.response ?? data,
      old = parse(link.remote_data, {}),
      changes = diff(old, payload);
    await db.batch([
      db
        .prepare(
          `UPDATE truckersmp_links SET remote_data=?,verified=1,last_synced_at=CURRENT_TIMESTAMP,sync_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        )
        .bind(JSON.stringify(payload), link.id),
      db
        .prepare(
          `INSERT INTO truckersmp_sync_logs (id,link_id,status,message,changes) VALUES (?,?,'success','Synchronisierung erfolgreich',?)`,
        )
        .bind(randomId(), link.id, JSON.stringify(changes)),
    ]);
    if (link.type === "player") {
      const p = payload.player ?? payload;
      await db
        .prepare(
          `UPDATE personnel_records SET truckersmp_id=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND vtc_id=?`,
        )
        .bind(link.truckersmp_id, link.user_id, link.vtc_id)
        .run();
      if (p.name)
        await db
          .prepare(`UPDATE users SET updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(link.user_id)
          .run();
    } else {
      const v = payload.vtc ?? payload;
      if (v.name)
        await db
          .prepare(`UPDATE vtcs SET truckersmp_id=? WHERE id=?`)
          .bind(link.truckersmp_id, link.vtc_id)
          .run();
    }
    return Response.json({ saved: true, data: payload, changes });
  } catch (e) {
    const msg = (
      e instanceof Error ? e.message : "TruckersMP-API nicht erreichbar"
    ).slice(0, 500);
    await db.batch([
      db
        .prepare(
          `UPDATE truckersmp_links SET sync_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        )
        .bind(msg, link.id),
      db
        .prepare(
          `INSERT INTO truckersmp_sync_logs (id,link_id,status,message) VALUES (?,?,'error',?)`,
        )
        .bind(randomId(), link.id, msg),
    ]);
    return apiError(`Synchronisierung fehlgeschlagen: ${msg}`, 502);
  }
}
async function tmpFetch(url: string) {
  const c = new AbortController(),
    timer = setTimeout(() => c.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "ConvoyHub/1.0" },
      signal: c.signal,
    });
    if (!r.ok) throw new Error(`TruckersMP antwortet mit HTTP ${r.status}`);
    return (await r.json()) as any;
  } finally {
    clearTimeout(timer);
  }
}
const parse = (v: unknown, f: any) => {
    try {
      return JSON.parse(String(v));
    } catch {
      return f;
    }
  },
  diff = (a: any, b: any) =>
    Object.fromEntries(
      Object.keys({ ...a, ...b })
        .filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]))
        .map((k) => [k, { from: a?.[k], to: b?.[k] }]),
    );
import {resolveVtcId} from "@/lib/platform";

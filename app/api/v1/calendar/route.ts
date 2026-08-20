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
  id?: string;
  data?: Record<string, unknown>;
};
const clean = (v: unknown, n = 2000) =>
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
      .prepare(`SELECT id FROM memberships WHERE vtc_id=? AND user_id=?`)
      .bind(vtcId, user.id)
      .first();
  if (!member) return apiError("Keine Mitgliedschaft", 403);
  const [entries, events, leave, availability, drivers] = await Promise.all([
    db
      .prepare(
        `SELECT c.*,u.display_name AS owner FROM calendar_entries c LEFT JOIN users u ON u.id=c.user_id WHERE c.vtc_id=? AND (c.visibility='vtc' OR c.user_id=?) ORDER BY c.starts_at`,
      )
      .bind(vtcId, user.id)
      .all(),
    db
      .prepare(
        `SELECT id,name AS title,description,starts_at,timezone,'event' type FROM events WHERE vtc_id=? ORDER BY starts_at`,
      )
      .bind(vtcId)
      .all(),
    db
      .prepare(
        `SELECT l.*,u.display_name AS driver,r.display_name AS representative FROM leave_requests l JOIN users u ON u.id=l.user_id LEFT JOIN users r ON r.id=l.representative_id WHERE l.vtc_id=? AND (l.user_id=? OR EXISTS (SELECT 1 FROM roles ro JOIN memberships m ON m.role_id=ro.id WHERE m.vtc_id=? AND m.user_id=? AND ro.permissions LIKE '%manage_drivers%')) ORDER BY l.starts_at DESC`,
      )
      .bind(vtcId, user.id, vtcId, user.id)
      .all(),
    db
      .prepare(
        `SELECT a.*,u.display_name AS driver FROM driver_availability a JOIN users u ON u.id=a.user_id WHERE a.vtc_id=? ORDER BY a.weekday,u.display_name`,
      )
      .bind(vtcId)
      .all(),
    db
      .prepare(
        `SELECT u.id,u.display_name AS name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.vtc_id=? AND m.status IN ('active','probation') ORDER BY u.display_name`,
      )
      .bind(vtcId)
      .all(),
  ]);
  if (url.searchParams.get("format") === "ics") {
    const all = [...(entries.results as any[]), ...(events.results as any[])],
      ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//VTC Truck Hub//DE\r\n${all.map((x) => `BEGIN:VEVENT\r\nUID:${x.id}@vtc-truck-hub\r\nDTSTART:${icsDate(x.starts_at)}\r\n${x.ends_at ? `DTEND:${icsDate(x.ends_at)}\r\n` : ""}SUMMARY:${esc(x.title || x.name)}\r\nDESCRIPTION:${esc(x.description || "")}\r\nEND:VEVENT`).join("\r\n")}\r\nEND:VCALENDAR`;
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="vtc-truck-hub-${vtcId}.ics"`,
      },
    });
  }
  return Response.json({
    user: { id: user.id },
    canManage: Boolean(
      await requireVtcPermission(request, vtcId, "manage_drivers"),
    ),
    entries: entries.results,
    events: events.results,
    leave: leave.results,
    availability: availability.results,
    drivers: drivers.results,
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
  if (b.action === "leave") {
    if (!clean(d.startsAt, 30) || !clean(d.endsAt, 30))
      return apiError("Von und bis sind Pflicht");
    const id = randomId();
    await db
      .prepare(
        `INSERT INTO leave_requests (id,vtc_id,user_id,type,starts_at,ends_at,reason,representative_id) VALUES (?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        vtcId,
        user.id,
        clean(d.type, 30) || "vacation",
        clean(d.startsAt, 30),
        clean(d.endsAt, 30),
        clean(d.reason, 2000) || null,
        clean(d.representativeId, 100) || null,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "availability") {
    const weekday = Math.max(0, Math.min(6, Number(d.weekday) || 0));
    await db
      .prepare(
        `INSERT INTO driver_availability (id,vtc_id,user_id,weekday,available_from,available_to,note) VALUES (?,?,?,?,?,?,?) ON CONFLICT(vtc_id,user_id,weekday) DO UPDATE SET available_from=excluded.available_from,available_to=excluded.available_to,note=excluded.note`,
      )
      .bind(
        randomId(),
        vtcId,
        user.id,
        weekday,
        clean(d.availableFrom, 10) || null,
        clean(d.availableTo, 10) || null,
        clean(d.note, 500) || null,
      )
      .run();
    return Response.json({ saved: true });
  }
  if (b.action === "entry") {
    const canManage = await requireVtcPermission(
      request,
      vtcId,
      "manage_events",
    );
    const visibility = clean(d.visibility, 20) || "private";
    if (visibility !== "private" && !canManage)
      return apiError(
        "Nur Eventmanagement darf Speditionstermine erstellen",
        403,
      );
    const id = b.id || randomId();
    await db
      .prepare(
        `INSERT INTO calendar_entries (id,vtc_id,user_id,type,title,description,starts_at,ends_at,timezone,recurrence,visibility,reminder_minutes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,timezone=excluded.timezone,recurrence=excluded.recurrence,visibility=excluded.visibility,reminder_minutes=excluded.reminder_minutes`,
      )
      .bind(
        id,
        vtcId,
        visibility === "private" ? user.id : null,
        clean(d.type, 40) || "appointment",
        clean(d.title, 160),
        clean(d.description, 2000) || null,
        clean(d.startsAt, 30),
        clean(d.endsAt, 30) || null,
        clean(d.timezone, 80) || "Europe/Berlin",
        clean(d.recurrence, 100) || null,
        visibility,
        Number(d.reminderMinutes) || null,
        user.id,
      )
      .run();
    return Response.json({ saved: true, id });
  }
  if (b.action === "reviewLeave" && b.id) {
    const actor = await requireVtcPermission(request, vtcId, "manage_drivers");
    if (!actor) return apiError("Personalrecht erforderlich", 403);
    const status = clean(d.status, 20);
    if (!["approved", "rejected"].includes(status))
      return apiError("Ungültiger Status");
    await db.batch([
      db
        .prepare(
          `UPDATE leave_requests SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND vtc_id=?`,
        )
        .bind(status, actor.id, b.id, vtcId),
      db
        .prepare(
          `UPDATE personnel_records SET status=CASE WHEN ?='approved' THEN 'leave' ELSE status END WHERE vtc_id=? AND user_id=(SELECT user_id FROM leave_requests WHERE id=?)`,
        )
        .bind(status, vtcId, b.id),
    ]);
    return Response.json({ saved: true });
  }
  return apiError("Ungültige Kalenderaktion");
}
const icsDate = (v: string) =>
  new Date(v)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const esc = (v: string) =>
  String(v).replace(
    /[\\;,\n]/g,
    (m) => ({ "\\": "\\\\", ";": "\\;", ",": "\\,", "\n": "\\n" })[m] || m,
  );
import {resolveVtcId} from "@/lib/platform";

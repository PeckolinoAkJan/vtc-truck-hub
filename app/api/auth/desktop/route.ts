import { ensureDatabase, platformEnv, randomId } from "@/lib/platform";

const allowed = new Set(["google", "steam", "discord"]);

export async function POST(request: Request) {
  await ensureDatabase();
  const body = (await request.json().catch(() => ({}))) as { provider?: string };
  const provider = String(body.provider ?? "").toLowerCase();
  if (!allowed.has(provider)) return Response.json({ error: "Unbekannter Anmeldeanbieter" }, { status: 400 });
  const token = `${randomId()}${randomId()}`;
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  await platformEnv().DB.prepare(`INSERT INTO desktop_auth_requests (token,provider,expires_at) VALUES (?,?,?)`).bind(token, provider, expires).run();
  const origin = new URL(request.url).origin;
  return Response.json({ token, expiresAt: expires, verificationUrl: `${origin}/api/auth/desktop/authorize?provider=${provider}&token=${encodeURIComponent(token)}` });
}

export async function GET(request: Request) {
  await ensureDatabase();
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return Response.json({ error: "Token fehlt" }, { status: 400 });
  const db = platformEnv().DB;
  const row = await db.prepare(`SELECT r.status,r.expires_at AS expiresAt,r.consumed_at AS consumedAt,u.id,u.display_name AS displayName,u.email FROM desktop_auth_requests r LEFT JOIN users u ON u.id=r.user_id WHERE r.token=?`).bind(token).first<{ status: string; expiresAt: string; consumedAt: string | null; id: string | null; displayName: string | null; email: string | null }>();
  if (!row || new Date(row.expiresAt).getTime() < Date.now()) return Response.json({ status: "expired" }, { status: 410 });
  if (row.consumedAt) return Response.json({ status: "consumed" }, { status: 410 });
  if (row.status !== "approved" || !row.id) return Response.json({ status: "pending", expiresAt: row.expiresAt });
  const memberships=await db.prepare(`SELECT v.id,v.name,v.tag,r.name AS roleName FROM memberships m JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id WHERE m.user_id=? AND m.status='active' ORDER BY r.rank DESC,v.name`).bind(row.id).all();
  await db.prepare(`UPDATE desktop_auth_requests SET consumed_at=CURRENT_TIMESTAMP WHERE token=? AND consumed_at IS NULL`).bind(token).run();
  return Response.json({ status: "approved", user: { id: row.id, displayName: row.displayName, email: row.email },memberships:memberships.results,apiBase:new URL(request.url).origin });
}

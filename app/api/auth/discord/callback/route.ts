import { createSession, ensureDatabase, platformEnv, randomId } from "@/lib/platform";

export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state"), cookies = request.headers.get("cookie") ?? "", cookie = cookies.match(/(?:^|; )oauth_state=([^;]+)/)?.[1], desktopToken = cookies.match(/(?:^|; )desktop_auth=([^;]+)/)?.[1], cfg = platformEnv();
  if (!code || !state || state !== cookie) return Response.json({ error: "Ungültiger OAuth-Zustand" }, { status: 400 });
  if (!cfg.DISCORD_CLIENT_ID || !cfg.DISCORD_CLIENT_SECRET) return Response.json({ error: "Discord ist nicht konfiguriert" }, { status: 503 });
  const redirect = `${url.origin}/api/auth/discord/callback`;
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.DISCORD_CLIENT_ID, client_secret: cfg.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirect }) });
  if (!tokenRes.ok) return Response.json({ error: "Discord-Tokenaustausch fehlgeschlagen" }, { status: 502 });
  const token = (await tokenRes.json()) as { access_token: string }, profileRes = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${token.access_token}` } }), p = (await profileRes.json()) as { id: string; username: string; global_name?: string; email?: string };
  const linked = await cfg.DB.prepare(`SELECT user_id AS userId FROM linked_accounts WHERE provider='discord' AND provider_id=?`).bind(p.id).first<{ userId: string }>(), userId = linked?.userId ?? randomId();
  if (!linked) await cfg.DB.batch([cfg.DB.prepare(`INSERT INTO users (id,email,display_name) VALUES (?,?,?)`).bind(userId, p.email ?? null, p.global_name ?? p.username), cfg.DB.prepare(`INSERT INTO linked_accounts (user_id,provider,provider_id,username,profile_url) VALUES (?,'discord',?,?,?)`).bind(userId, p.id, p.username, `https://discord.com/users/${p.id}`)]);
  if (desktopToken) await cfg.DB.prepare(`UPDATE desktop_auth_requests SET user_id=?,status='approved' WHERE token=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`).bind(userId, decodeURIComponent(desktopToken)).run();
  return new Response(null, { status: 302, headers: { Location: desktopToken ? "/konto?desktop=connected&provider=discord" : "/konto?connected=discord", "Set-Cookie": await createSession(userId, request) } });
}

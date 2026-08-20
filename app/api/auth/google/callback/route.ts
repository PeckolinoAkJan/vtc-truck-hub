import { createSession, ensureDatabase, platformEnv, randomId } from "@/lib/platform";

export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state"), cookies = request.headers.get("cookie") ?? "", expected = cookies.match(/(?:^|; )google_state=([^;]+)/)?.[1], desktopToken = cookies.match(/(?:^|; )desktop_auth=([^;]+)/)?.[1], cfg = platformEnv();
  if (!code || !state || state !== expected) return Response.json({ error: "Ungültiger Google-OAuth-Zustand" }, { status: 400 });
  if (!cfg.GOOGLE_CLIENT_ID || !cfg.GOOGLE_CLIENT_SECRET) return Response.json({ error: "Google ist nicht konfiguriert" }, { status: 503 });
  const redirect = `${url.origin}/api/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.GOOGLE_CLIENT_ID, client_secret: cfg.GOOGLE_CLIENT_SECRET, code, grant_type: "authorization_code", redirect_uri: redirect }) });
  if (!tokenRes.ok) return Response.json({ error: "Google-Tokenaustausch fehlgeschlagen" }, { status: 502 });
  const tokens = (await tokenRes.json()) as { access_token: string };
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profileRes.ok) return Response.json({ error: "Google-Profil konnte nicht geladen werden" }, { status: 502 });
  const p = (await profileRes.json()) as { sub: string; email?: string; name?: string; picture?: string };
  const linked = await cfg.DB.prepare(`SELECT user_id AS userId FROM linked_accounts WHERE provider='google' AND provider_id=?`).bind(p.sub).first<{ userId: string }>();
  const userId = linked?.userId ?? randomId();
  if (!linked) await cfg.DB.batch([
    cfg.DB.prepare(`INSERT INTO users (id,email,display_name) VALUES (?,?,?)`).bind(userId, p.email ?? null, p.name ?? "Google Benutzer"),
    cfg.DB.prepare(`INSERT INTO linked_accounts (user_id,provider,provider_id,username,profile_url) VALUES (?,'google',?,?,?)`).bind(userId, p.sub, p.email ?? p.name ?? "Google", p.picture ?? null),
  ]);
  if (desktopToken) await cfg.DB.prepare(`UPDATE desktop_auth_requests SET user_id=?,status='approved' WHERE token=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`).bind(userId, decodeURIComponent(desktopToken)).run();
  return new Response(null, { status: 302, headers: { Location: desktopToken ? "/konto?desktop=connected&provider=google" : "/konto?connected=google", "Set-Cookie": await createSession(userId, request) } });
}

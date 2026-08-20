import { audit, createSession, ensureDatabase, platformEnv, randomId } from "@/lib/platform";

export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = request.headers.get("cookie") ?? "";
  const stateCookie = cookies.match(/(?:^|; )oauth_state=([^;]+)/)?.[1];
  const desktopToken = cookies.match(/(?:^|; )desktop_auth=([^;]+)/)?.[1];
  const cfg = platformEnv();
  if (!code || !state || state !== stateCookie) {
    return Response.json({ error: "Ungültiger OAuth-Zustand" }, { status: 400 });
  }
  if (!cfg.DISCORD_CLIENT_ID || !cfg.DISCORD_CLIENT_SECRET) {
    return Response.json({ error: "Discord ist nicht konfiguriert" }, { status: 503 });
  }
  const redirect = `${url.origin}/api/auth/discord/callback`;
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.DISCORD_CLIENT_ID,
      client_secret: cfg.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
    }),
  });
  if (!tokenRes.ok) return Response.json({ error: "Discord-Tokenaustausch fehlgeschlagen" }, { status: 502 });
  const token = await tokenRes.json() as { access_token: string };
  const profileRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) return Response.json({ error: "Discord-Profil konnte nicht geladen werden" }, { status: 502 });
  const profile = await profileRes.json() as {
    id: string;
    username: string;
    global_name?: string;
    email?: string;
  };
  const email = profile.email?.trim().toLowerCase() || null;
  const linked = await cfg.DB.prepare(
    `SELECT user_id AS userId FROM linked_accounts WHERE provider='discord' AND provider_id=?`,
  ).bind(profile.id).first<{ userId: string }>();
  const emailUser = !linked && email
    ? await cfg.DB.prepare(`SELECT id AS userId FROM users WHERE lower(email)=?`).bind(email).first<{ userId: string }>()
    : null;
  const userId = linked?.userId ?? emailUser?.userId ?? randomId();
  if (!linked && !emailUser) {
    await cfg.DB.prepare(`INSERT INTO users (id,email,display_name) VALUES (?,?,?)`)
      .bind(userId, email, profile.global_name ?? profile.username).run();
  }
  if (!linked) {
    await cfg.DB.prepare(
      `INSERT OR IGNORE INTO linked_accounts (user_id,provider,provider_id,username,profile_url)
       VALUES (?,'discord',?,?,?)`,
    ).bind(userId, profile.id, profile.username, `https://discord.com/users/${profile.id}`).run();
  }
  await cfg.DB.prepare(`INSERT OR IGNORE INTO account_security (user_id) VALUES (?)`).bind(userId).run();
  if (desktopToken) {
    await cfg.DB.prepare(
      `UPDATE desktop_auth_requests SET user_id=?,status='approved'
       WHERE token=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`,
    ).bind(userId, decodeURIComponent(desktopToken)).run();
  }
  await audit("user.login", "session", null, userId, { method: "discord-oauth" });
  const headers = new Headers({
    Location: desktopToken ? "/konto?desktop=connected&provider=discord" : "/konto?connected=discord",
  });
  headers.append("Set-Cookie", await createSession(userId, request));
  headers.append("Set-Cookie", "oauth_state=; Path=/api/auth/discord; HttpOnly; SameSite=Lax; Max-Age=0");
  headers.append("Set-Cookie", "desktop_auth=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0");
  return new Response(null, { status: 302, headers });
}

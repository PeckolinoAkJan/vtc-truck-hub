import { createSession, ensureDatabase, platformEnv, randomId } from "@/lib/platform";

export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url), state = url.searchParams.get("state"), cookies = request.headers.get("cookie") ?? "", cookie = cookies.match(/(?:^|; )steam_state=([^;]+)/)?.[1], desktopToken = cookies.match(/(?:^|; )desktop_auth=([^;]+)/)?.[1];
  if (!state || state !== cookie) return Response.json({ error: "Ungültiger Steam-Zustand" }, { status: 400 });
  const verify = new URLSearchParams();
  url.searchParams.forEach((v, k) => { if (k.startsWith("openid.")) verify.set(k, v); });
  verify.set("openid.mode", "check_authentication");
  const result = await fetch("https://steamcommunity.com/openid/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: verify });
  if (!(await result.text()).includes("is_valid:true")) return Response.json({ error: "Steam-Bestätigung fehlgeschlagen" }, { status: 401 });
  const claimed = url.searchParams.get("openid.claimed_id") ?? "", steamId = claimed.match(/\/openid\/id\/(\d+)$/)?.[1];
  if (!steamId) return Response.json({ error: "Steam-ID fehlt" }, { status: 400 });
  const db = platformEnv().DB, linked = await db.prepare(`SELECT user_id AS userId FROM linked_accounts WHERE provider='steam' AND provider_id=?`).bind(steamId).first<{ userId: string }>(), userId = linked?.userId ?? randomId();
  if (!linked) await db.batch([db.prepare(`INSERT INTO users (id,display_name) VALUES (?,?)`).bind(userId, `Steam ${steamId.slice(-6)}`), db.prepare(`INSERT INTO linked_accounts (user_id,provider,provider_id,username,profile_url) VALUES (?,'steam',?,?,?)`).bind(userId, steamId, `Steam ${steamId.slice(-6)}`, `https://steamcommunity.com/profiles/${steamId}`)]);
  if (desktopToken) await db.prepare(`UPDATE desktop_auth_requests SET user_id=?,status='approved' WHERE token=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`).bind(userId, decodeURIComponent(desktopToken)).run();
  const headers=new Headers({Location:desktopToken?"/konto?desktop=connected&provider=steam":"/konto?connected=steam"});
  headers.append("Set-Cookie",await createSession(userId,request));
  headers.append("Set-Cookie","desktop_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return new Response(null,{status:302,headers});
}

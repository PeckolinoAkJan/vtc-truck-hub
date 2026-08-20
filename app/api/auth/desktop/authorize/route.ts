import { ensureDatabase, platformEnv } from "@/lib/platform";

export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url), token = url.searchParams.get("token") ?? "", provider = url.searchParams.get("provider") ?? "";
  const row = await platformEnv().DB.prepare(`SELECT token FROM desktop_auth_requests WHERE token=? AND provider=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`).bind(token, provider).first();
  if (!row) return Response.json({ error: "Anmeldeanforderung ist ungültig oder abgelaufen" }, { status: 410 });
  return new Response(null, { status: 302, headers: { Location: `/api/auth/${provider}/start`, "Set-Cookie": `desktop_auth=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === "https:" ? "; Secure" : ""}` } });
}

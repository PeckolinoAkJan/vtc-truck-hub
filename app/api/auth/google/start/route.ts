import { platformEnv, randomId } from "@/lib/platform";

export async function GET(request: Request) {
  const clientId = platformEnv().GOOGLE_CLIENT_ID;
  if (!clientId) return Response.json({ error: "Google ist noch nicht konfiguriert. GOOGLE_CLIENT_ID fehlt." }, { status: 503 });
  const url = new URL(request.url), state = randomId(), redirect = `${url.origin}/api/auth/google/callback`, target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Set-Cookie": `google_state=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === "https:" ? "; Secure" : ""}` } });
}

import { apiError, audit, createSession } from "@/lib/platform";
import { approveDesktopAuth, supabaseUserFromToken, syncSupabaseMemberships, syncSupabaseUser } from "@/lib/supabase-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { accessToken?: string };
  const token = String(body.accessToken ?? "");
  if (!token) return apiError("Anmeldetoken fehlt", 400);
  const external = await supabaseUserFromToken(token);
  if (!external) return apiError("Google-/Discord-Anmeldung konnte nicht bestätigt werden", 401);
  const user = await syncSupabaseUser(external);
  await syncSupabaseMemberships(token, external.id, user.id);
  await approveDesktopAuth(request, user.id);
  await audit("user.login", "session", null, user.id, { method: "supabase-oauth" });
  const headers = new Headers();
  headers.append("Set-Cookie", await createSession(user.id, request));
  headers.append("Set-Cookie", "desktop_auth=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0");
  return Response.json({ user }, { headers });
}

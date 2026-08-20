import { supabaseOAuthUrl } from "@/lib/supabase-auth";

export async function GET(request: Request) {
  const target = supabaseOAuthUrl(request, "google");
  if (!target) return Response.json({ error: "Google-Anmeldung ist noch nicht mit Supabase verbunden." }, { status: 503 });
  return Response.redirect(target, 302);
}

import { apiError, audit, getSessionUser, platformEnv } from "@/lib/platform";
import { syncSupabaseDirectory } from "@/lib/supabase-auth";

const clean = (value: unknown, length = 160) => String(value ?? "").trim().slice(0, length);
type ProfileRow = { avatarUploadId?: string | null; bio?: string | null; mainGame?: string | null; socialLinks?: string | null };
type DetailsRow = { firstName?: string | null; lastName?: string | null; street?: string | null; postalCode?: string | null; city?: string | null; country?: string | null; phone?: string | null; publicDisplayName?: number };
type MembershipRow = { id: string; name: string; tag: string; slug: string; roleName?: string | null; permissions?: string | null };
type ProfileBody = Record<string, unknown> & { displayName?: unknown; publicDisplayName?: boolean; liveMapPublicVisible?: boolean; liveMapShowExactToVtc?: boolean };

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ user: null }, { status: 401 });
  await syncSupabaseDirectory().catch(() => null);
  const env = platformEnv();
  const [profile, details, setting, memberships, liveMap] = await Promise.all([
    env.DB.prepare(
      `SELECT avatar_upload_id AS avatarUploadId,bio,main_game AS mainGame,social_links AS socialLinks FROM user_profiles WHERE user_id=?`,
    ).bind(user.id).first<ProfileRow>(),
    env.DB.prepare(
      `SELECT first_name AS firstName,last_name AS lastName,street,postal_code AS postalCode,city,country,phone,public_display_name AS publicDisplayName FROM user_profile_details WHERE user_id=?`,
    ).bind(user.id).first<DetailsRow>(),
    env.DB.prepare(`SELECT value FROM platform_settings WHERE key='founder_email'`).first<{ value: string }>(),
    env.DB.prepare(
      `SELECT v.id,v.name,v.tag,v.slug,r.name AS roleName,r.permissions FROM memberships m JOIN vtcs v ON v.id=m.vtc_id LEFT JOIN roles r ON r.id=m.role_id WHERE m.user_id=? AND m.status='active' ORDER BY r.rank DESC,v.name`,
    ).bind(user.id).all<MembershipRow>(),
    env.DB.prepare(
      `SELECT public_visible AS liveMapPublicVisible,show_exact_to_vtc AS liveMapShowExactToVtc FROM live_map_preferences WHERE user_id=?`,
    ).bind(user.id).first<{ liveMapPublicVisible: number; liveMapShowExactToVtc: number }>(),
  ]);
  const founderEmail = (setting?.value || env.FOUNDER_EMAIL || "").trim().toLowerCase();
  const isFounder = Boolean(user.email && founderEmail && user.email.trim().toLowerCase() === founderEmail);
  return Response.json({
    user: {
      ...user,
      ...profile,
      ...details,
      liveMapPublicVisible: liveMap?.liveMapPublicVisible ?? 1,
      liveMapShowExactToVtc: liveMap?.liveMapShowExactToVtc ?? 1,
      avatarUrl: profile?.avatarUploadId ? `/api/v1/uploads?id=${profile.avatarUploadId}` : null,
    },
    memberships: memberships.results.map((membership) => ({
      ...membership,
      permissions: JSON.parse(String(membership.permissions || "[]")),
    })),
    isFounder,
  });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  const body = await request.json() as ProfileBody;
  const displayName = clean(body.displayName, 100);
  if (displayName.length < 2) return apiError("Der Anzeigename muss mindestens 2 Zeichen haben");
  const db = platformEnv().DB;
  await db.batch([
    db.prepare(
      `UPDATE users SET display_name=?,locale=?,timezone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(displayName, clean(body.locale, 10) || "de", clean(body.timezone, 80) || "Europe/Berlin", user.id),
    db.prepare(
      `INSERT INTO user_profile_details (user_id,first_name,last_name,street,postal_code,city,country,phone,public_display_name) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,street=excluded.street,postal_code=excluded.postal_code,city=excluded.city,country=excluded.country,phone=excluded.phone,public_display_name=excluded.public_display_name,updated_at=CURRENT_TIMESTAMP`,
    ).bind(
      user.id,
      clean(body.firstName, 100) || null,
      clean(body.lastName, 100) || null,
      clean(body.street, 180) || null,
      clean(body.postalCode, 20) || null,
      clean(body.city, 100) || null,
      clean(body.country, 100) || null,
      clean(body.phone, 40) || null,
      body.publicDisplayName === false ? 0 : 1,
    ),
    db.prepare(
      `INSERT INTO live_map_preferences (user_id,public_visible,show_exact_to_vtc,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET public_visible=excluded.public_visible,show_exact_to_vtc=excluded.show_exact_to_vtc,updated_at=CURRENT_TIMESTAMP`,
    ).bind(
      user.id,
      body.liveMapPublicVisible === false ? 0 : 1,
      body.liveMapShowExactToVtc === false ? 0 : 1,
    ),
  ]);
  await audit("account.profile.updated", "user", user.id, user.id);
  return Response.json({ saved: true });
}

export async function DELETE(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|; )convoy_session=([^;]+)/)?.[1];
  if (token) {
    const { ensureDatabase, platformEnv } = await import("@/lib/platform");
    await ensureDatabase();
    await platformEnv().DB.prepare(`DELETE FROM sessions WHERE id=?`).bind(token).run();
  }
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": "convoy_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" },
  });
}

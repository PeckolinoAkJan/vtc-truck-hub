import {
  apiError,
  audit,
  createSession,
  ensureDatabase,
  platformEnv,
  sha256,
  verifyPassword,
  verifyTotp,
} from "@/lib/platform";
import { supabasePasswordSignIn, syncSupabaseMemberships, syncSupabaseUser } from "@/lib/supabase-auth";
export async function POST(request: Request) {
  await ensureDatabase();
  const body = (await request.json()) as {
      email?: string;
      password?: string;
      twoFactorCode?: string;
    },
    email = body.email?.trim().toLowerCase(),
    db = platformEnv().DB;
  if (!email || !body.password)
    return apiError("E-Mail und Passwort erforderlich");
  const supabaseLogin = await supabasePasswordSignIn(email, body.password);
  if (supabaseLogin?.ok) {
    const synced = await syncSupabaseUser(supabaseLogin.user);
    await syncSupabaseMemberships(supabaseLogin.accessToken, supabaseLogin.user.id, synced.id);
    await audit("user.login", "session", null, synced.id, { method: "supabase-password" });
    return Response.json({ user: synced }, {
      headers: { "Set-Cookie": await createSession(synced.id, request) },
    });
  }
  const user = await db
    .prepare(
      `SELECT u.id,u.email,u.display_name AS displayName,u.password_hash AS passwordHash,a.two_factor_secret AS twoFactorSecret,a.recovery_codes AS recoveryCodes,a.failed_logins AS failedLogins,a.locked_until AS lockedUntil FROM users u LEFT JOIN account_security a ON a.user_id=u.id WHERE u.email=?`,
    )
    .bind(email)
    .first<any>();
  if (user?.lockedUntil && new Date(user.lockedUntil) > new Date())
    return apiError(
      "Konto vorübergehend gesperrt. Bitte später erneut versuchen.",
      429,
    );
  if (
    !user?.passwordHash ||
    !(await verifyPassword(body.password, user.passwordHash))
  ) {
    if (user) {
      const fails = Number(user.failedLogins || 0) + 1,
        lock =
          fails >= 5 ? new Date(Date.now() + 15 * 60e3).toISOString() : null;
      await db
        .prepare(
          `INSERT INTO account_security (user_id,failed_logins,locked_until) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET failed_logins=?,locked_until=?,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(user.id, fails, lock, fails, lock)
        .run();
      await db
        .prepare(
          `INSERT INTO security_events (id,user_id,type,severity,detail) VALUES (?,?, 'login.failed',?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          fails >= 5 ? "high" : "medium",
          JSON.stringify({ fails }),
        )
        .run();
    }
    return apiError("Anmeldedaten ungültig", 401);
  }
  if (
    user.twoFactorSecret &&
    !String(user.twoFactorSecret).startsWith("pending:")
  ) {
    const code = String(body.twoFactorCode || "").trim();
    let valid = await verifyTotp(user.twoFactorSecret, code);
    if (!valid && code) {
      const hash = await sha256(code.toUpperCase()),
        codes = JSON.parse(user.recoveryCodes || "[]") as string[],
        i = codes.indexOf(hash);
      if (i >= 0) {
        codes.splice(i, 1);
        valid = true;
        await db
          .prepare(
            `UPDATE account_security SET recovery_codes=? WHERE user_id=?`,
          )
          .bind(JSON.stringify(codes), user.id)
          .run();
      }
    }
    if (!valid)
      return Response.json(
        { error: "Zwei-Faktor-Code erforderlich", twoFactorRequired: true },
        { status: 428 },
      );
  }
  await db
    .prepare(
      `INSERT INTO account_security (user_id,failed_logins,locked_until) VALUES (?,0,NULL) ON CONFLICT(user_id) DO UPDATE SET failed_logins=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP`,
    )
    .bind(user.id)
    .run();
  await audit("user.login", "session", null, user.id, {
    method: "password",
    twoFactor: Boolean(user.twoFactorSecret),
  });
  return Response.json(
    { user: { id: user.id, email: user.email, displayName: user.displayName } },
    { headers: { "Set-Cookie": await createSession(user.id, request) } },
  );
}

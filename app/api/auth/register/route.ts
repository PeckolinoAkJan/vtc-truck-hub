import {
  apiError,
  audit,
  createSession,
  ensureDatabase,
  hashPassword,
  platformEnv,
  randomId,
} from "@/lib/platform";
import {issuePersonalClientKey} from "@/lib/client-access";
export async function POST(request: Request) {
  await ensureDatabase();
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    displayName?: string;
    acceptRules?: boolean;
    acceptPrivacy?: boolean;
  };
  const email = body.email?.trim().toLowerCase(),
    name = body.displayName?.trim(),
    password = body.password ?? "";
  if (!email || !/^\S+@\S+\.\S+$/.test(email))
    return apiError("Gültige E-Mail erforderlich");
  if (!name || name.length < 2) return apiError("Fahrername erforderlich");
  if (password.length < 10)
    return apiError("Passwort muss mindestens 10 Zeichen haben");
  if (!body.acceptRules || !body.acceptPrivacy)
    return apiError("Regeln und Datenschutz müssen bestätigt werden");
  if (
    await platformEnv()
      .DB.prepare(`SELECT id FROM users WHERE email=?`)
      .bind(email)
      .first()
  )
    return apiError("E-Mail ist bereits registriert", 409);
  const id = randomId(),
    db = platformEnv().DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id,email,display_name,password_hash) VALUES (?,?,?,?)`,
      )
      .bind(id, email, name, await hashPassword(password)),
    db.prepare(`INSERT INTO account_security (user_id) VALUES (?)`).bind(id),
    db
      .prepare(
        `INSERT INTO user_consents (id,user_id,type,version) VALUES (?,?,'rules','1.0')`,
      )
      .bind(randomId(), id),
    db
      .prepare(
        `INSERT INTO user_consents (id,user_id,type,version) VALUES (?,?,'privacy','1.0')`,
      )
      .bind(randomId(), id),
  ]);
  await issuePersonalClientKey(id);
  await audit("user.register", "user", id, id, { method: "password" });
  return Response.json(
    { user: { id, email, displayName: name } },
    {
      status: 201,
      headers: { "Set-Cookie": await createSession(id, request) },
    },
  );
}

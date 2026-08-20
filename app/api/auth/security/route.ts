import {
  apiError,
  audit,
  ensureDatabase,
  getSessionUser,
  hashPassword,
  platformEnv,
  publicRequestOrigin,
  randomBase32,
  randomId,
  sha256,
  verifyTotp,
  verifyPassword,
} from "@/lib/platform";
const clean = (v: unknown, n = 300) =>
    String(v ?? "")
      .trim()
      .slice(0, n),
  cookieToken = (r: Request) =>
    r.headers.get("cookie")?.match(/(?:^|; )convoy_session=([^;]+)/)?.[1];

export async function GET(request: Request) {
  await ensureDatabase();
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  if (action === "changePassword") {
    const row = await db
      .prepare(`SELECT password_hash AS passwordHash FROM users WHERE id=?`)
      .bind(user.id)
      .first<{ passwordHash: string | null }>();
    if (!row?.passwordHash)
      return apiError(
        "Dieses Konto verwendet eine externe Anmeldung. Lege das Passwort über die Passwort-zurücksetzen-Funktion fest",
        409,
      );
    if (
      !(await verifyPassword(clean(b.currentPassword, 300), row.passwordHash))
    )
      return apiError("Das aktuelle Passwort ist falsch", 403);
    const next = clean(b.newPassword, 300);
    if (next.length < 10)
      return apiError("Das neue Passwort muss mindestens 10 Zeichen haben");
    if (next !== clean(b.confirmPassword, 300))
      return apiError("Die neuen Passwörter stimmen nicht überein");
    await db.batch([
      db
        .prepare(
          `UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        )
        .bind(await hashPassword(next), user.id),
      db
        .prepare(`DELETE FROM sessions WHERE user_id=? AND id<>?`)
        .bind(user.id, cookieToken(request) || ""),
    ]);
    await audit("account.password.changed", "user", user.id, user.id);
    return Response.json({ saved: true });
  }
  const db = platformEnv().DB,
    [security, sessions, links, events, consents] = await Promise.all([
      db
        .prepare(
          `SELECT email_verified_at AS emailVerifiedAt,two_factor_secret IS NOT NULL AS twoFactorEnabled,deletion_requested_at AS deletionRequestedAt FROM account_security WHERE user_id=?`,
        )
        .bind(user.id)
        .first<any>(),
      db
        .prepare(
          `SELECT id,user_agent AS userAgent,created_at AS createdAt,expires_at AS expiresAt FROM sessions WHERE user_id=? AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC`,
        )
        .bind(user.id)
        .all(),
      db
        .prepare(
          `SELECT provider,provider_id AS providerId,username,profile_url AS profileUrl,created_at AS createdAt FROM linked_accounts WHERE user_id=?`,
        )
        .bind(user.id)
        .all(),
      db
        .prepare(
          `SELECT type,severity,detail,created_at AS createdAt FROM security_events WHERE user_id=? ORDER BY created_at DESC LIMIT 50`,
        )
        .bind(user.id)
        .all(),
      db
        .prepare(
          `SELECT type,version,accepted_at AS acceptedAt,withdrawn_at AS withdrawnAt FROM user_consents WHERE user_id=? ORDER BY accepted_at DESC`,
        )
        .bind(user.id)
        .all(),
    ]);
  return Response.json({
    user,
    security: security ?? { emailVerifiedAt: null, twoFactorEnabled: false },
    sessions: sessions.results.map((s: any) => ({
      ...s,
      current: s.id === cookieToken(request),
    })),
    links: links.results,
    events: events.results,
    consents: consents.results,
  });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const b = (await request.json()) as any,
    db = platformEnv().DB,
    action = clean(b.action, 40);
  if (action === "requestReset" || action === "requestVerification") {
    const email = clean(b.email, 200).toLowerCase(),
      user = await db
        .prepare(`SELECT id,email FROM users WHERE lower(email)=?`)
        .bind(email)
        .first<any>();
    if (user) {
      const raw = randomId() + randomId(),
        hash = await sha256(raw),
        type =
          action === "requestReset" ? "password_reset" : "email_verification",
        expires = new Date(
          Date.now() + (type === "password_reset" ? 3600e3 : 86400e3),
        ).toISOString(),
        link = `${publicRequestOrigin(request)}/konto/passwort?token=${raw}&type=${type}`;
      await db.batch([
        db
          .prepare(
            `INSERT INTO account_tokens (id,user_id,type,token_hash,expires_at) VALUES (?,?,?,?,?)`,
          )
          .bind(randomId(), user.id, type, hash, expires),
        db
          .prepare(
            `INSERT INTO email_outbox (id,user_id,recipient,template,subject,payload) VALUES (?,?,?,?,?,?)`,
          )
          .bind(
            randomId(),
            user.id,
            user.email,
            type,
            type === "password_reset"
              ? "Passwort zurücksetzen"
              : "E-Mail bestätigen",
            JSON.stringify({ link, expires }),
          ),
      ]);
      await audit(`account.${type}.requested`, "user", user.id, user.id);
    }
    return Response.json({
      saved: true,
      message: "Wenn das Konto existiert, wurde eine E-Mail vorbereitet.",
    });
  }
  if (action === "resetPassword" || action === "verifyEmail") {
    const raw = clean(b.token, 200),
      hash = await sha256(raw),
      type =
        action === "resetPassword" ? "password_reset" : "email_verification",
      token = await db
        .prepare(
          `SELECT * FROM account_tokens WHERE token_hash=? AND type=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP`,
        )
        .bind(hash, type)
        .first<any>();
    if (!token) return apiError("Token ist ungültig oder abgelaufen", 400);
    if (type === "password_reset") {
      if (clean(b.password).length < 10)
        return apiError("Passwort muss mindestens 10 Zeichen haben");
      await db.batch([
        db
          .prepare(
            `UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          )
          .bind(await hashPassword(b.password), token.user_id),
        db.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(token.user_id),
      ]);
    } else
      await db
        .prepare(
          `INSERT INTO account_security (user_id,email_verified_at) VALUES (?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET email_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(token.user_id)
        .run();
    await db
      .prepare(`UPDATE account_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(token.id)
      .run();
    await audit(
      `account.${type}.completed`,
      "user",
      token.user_id,
      token.user_id,
    );
    return Response.json({ saved: true });
  }
  const user = await getSessionUser(request);
  if (!user) return apiError("Anmeldung erforderlich", 401);
  if (action === "setup2fa") {
    const secret = randomBase32(),
      issuer = encodeURIComponent("VTC Truck Hub"),
      label = encodeURIComponent(`${user.email ?? user.displayName}`);
    await db
      .prepare(
        `INSERT INTO account_security (user_id,two_factor_secret) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET two_factor_secret=excluded.two_factor_secret,updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(user.id, `pending:${secret}`)
      .run();
    return Response.json({
      secret,
      otpauth: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`,
    });
  }
  if (action === "enable2fa") {
    const row = await db
        .prepare(
          `SELECT two_factor_secret FROM account_security WHERE user_id=?`,
        )
        .bind(user.id)
        .first<any>(),
      secret = String(row?.two_factor_secret || "").replace(/^pending:/, "");
    if (!secret || !(await verifyTotp(secret, clean(b.code, 6))))
      return apiError("Bestätigungscode ist ungültig");
    const recovery = Array.from({ length: 10 }, () =>
        crypto.randomUUID().slice(0, 8).toUpperCase(),
      ),
      hashed = await Promise.all(recovery.map(sha256));
    await db
      .prepare(
        `UPDATE account_security SET two_factor_secret=?,recovery_codes=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`,
      )
      .bind(secret, JSON.stringify(hashed), user.id)
      .run();
    await db
      .prepare(`UPDATE users SET two_factor_enabled=1 WHERE id=?`)
      .bind(user.id)
      .run();
    await audit("account.2fa.enabled", "user", user.id, user.id);
    return Response.json({ saved: true, recoveryCodes: recovery });
  }
  if (action === "disable2fa") {
    await db.batch([
      db
        .prepare(
          `UPDATE account_security SET two_factor_secret=NULL,recovery_codes='[]',updated_at=CURRENT_TIMESTAMP WHERE user_id=?`,
        )
        .bind(user.id),
      db
        .prepare(`UPDATE users SET two_factor_enabled=0 WHERE id=?`)
        .bind(user.id),
    ]);
    await audit("account.2fa.disabled", "user", user.id, user.id);
    return Response.json({ saved: true });
  }
  if (action === "logoutOthers") {
    await db
      .prepare(`DELETE FROM sessions WHERE user_id=? AND id<>?`)
      .bind(user.id, cookieToken(request) || "")
      .run();
    return Response.json({ saved: true });
  }
  if (action === "revokeSession") {
    await db
      .prepare(`DELETE FROM sessions WHERE user_id=? AND id=?`)
      .bind(user.id, clean(b.id, 200))
      .run();
    return Response.json({ saved: true });
  }
  if (action === "consent") {
    await db
      .prepare(
        `INSERT INTO user_consents (id,user_id,type,version) VALUES (?,?,?,?)`,
      )
      .bind(
        randomId(),
        user.id,
        clean(b.type, 60),
        clean(b.version, 30) || "1.0",
      )
      .run();
    return Response.json({ saved: true });
  }
  if (action === "export") {
    const [account, memberships, trips, payrolls, applications] =
      await Promise.all([
        db
          .prepare(
            `SELECT id,email,display_name,locale,timezone,created_at FROM users WHERE id=?`,
          )
          .bind(user.id)
          .first(),
        db
          .prepare(`SELECT * FROM memberships WHERE user_id=?`)
          .bind(user.id)
          .all(),
        db.prepare(`SELECT * FROM trips WHERE user_id=?`).bind(user.id).all(),
        db
          .prepare(`SELECT * FROM payrolls WHERE user_id=?`)
          .bind(user.id)
          .all(),
        db
          .prepare(`SELECT * FROM applications WHERE user_id=?`)
          .bind(user.id)
          .all(),
      ]);
    await audit("account.exported", "user", user.id, user.id);
    return Response.json(
      {
        exportedAt: new Date().toISOString(),
        account,
        memberships: memberships.results,
        trips: trips.results,
        payrolls: payrolls.results,
        applications: applications.results,
      },
      {
        headers: {
          "Content-Disposition": `attachment; filename="vtc-truck-hub-export-${user.id}.json"`,
        },
      },
    );
  }
  if (action === "requestDeletion") {
    if (clean(b.confirm) !== "KONTO LÖSCHEN")
      return apiError("Bestätigungstext stimmt nicht");
    await db
      .prepare(
        `INSERT INTO account_security (user_id,deletion_requested_at) VALUES (?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET deletion_requested_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(user.id)
      .run();
    await db
      .prepare(`DELETE FROM sessions WHERE user_id=?`)
      .bind(user.id)
      .run();
    await audit("account.deletion.requested", "user", user.id, user.id);
    return Response.json(
      { saved: true, scheduled: true },
      {
        headers: {
          "Set-Cookie":
            "convoy_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        },
      },
    );
  }
  return apiError("Ungültige Sicherheitsaktion");
}

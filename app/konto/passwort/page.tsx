"use client";
import { useState } from "react";
export default function PasswordHelp() {
  const [message, setMessage] = useState(""),
    params =
      typeof window !== "undefined"
        ? new URLSearchParams(location.search)
        : new URLSearchParams(),
    token = params.get("token"),
    type = params.get("type");
  async function act(body: any) {
    const r = await fetch("/api/auth/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      j = await r.json();
    setMessage(r.ok ? "Vorgang erfolgreich abgeschlossen." : j.error);
  }
  return (
    <main className="founder-login">
      <section>
        <a className="brand" href="/">
          <span className="brand-mark">VH</span>
          <span>
            VTC TRUCK <span>HUB</span>
          </span>
        </a>
        {token && type === "email_verification" ? (
          <>
            <h1>E-Mail bestätigen</h1>
            <p>Bestätige die E-Mail-Adresse deines VTC-Truck-Hub-Kontos.</p>
            <button
              className="primary"
              onClick={() => act({ action: "verifyEmail", token })}
            >
              E-Mail jetzt bestätigen
            </button>
          </>
        ) : token && type === "password_reset" ? (
          <>
            <h1>Neues Passwort</h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act({
                  action: "resetPassword",
                  token,
                  password: new FormData(e.currentTarget).get("password"),
                });
              }}
            >
              <label>
                Neues Passwort
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                />
              </label>
              <button className="primary">Passwort speichern</button>
            </form>
          </>
        ) : (
          <>
            <h1>Passwort vergessen?</h1>
            <p>
              Wir bereiten eine zeitlich begrenzte Reset-E-Mail für das Konto
              vor.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act({
                  action: "requestReset",
                  email: new FormData(e.currentTarget).get("email"),
                });
              }}
            >
              <label>
                E-Mail
                <input name="email" type="email" required />
              </label>
              <button className="primary">Reset-Link anfordern</button>
            </form>
          </>
        )}
        {message && <p className="form-message">{message}</p>}
        <a href="/konto">Zur Anmeldung</a>
      </section>
    </main>
  );
}

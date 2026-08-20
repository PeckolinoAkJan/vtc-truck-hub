"use client";
import { FormEvent, useEffect, useState } from "react";
import ImageUploader from "../components/ImageUploader";
type User = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl?: string | null;
};
export default function Account() {
  const [user, setUser] = useState<User | null>(null),
    [mode, setMode] = useState<"login" | "register">("login"),
    [message, setMessage] = useState("");
  useEffect(() => {
    const authHash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const accessToken = authHash.get("access_token");
    if (accessToken) {
      setMessage("Google-/Discord-Anmeldung wird bestätigt …");
      fetch("/api/auth/supabase/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      }).then(async (r) => ({ ok: r.ok, data: await r.json() }))
        .then(({ ok, data }) => {
          history.replaceState({}, "", "/konto");
          if (!ok) return setMessage(data.error ?? "Anmeldung fehlgeschlagen");
          setUser(data.user);
          setMessage("Erfolgreich angemeldet.");
        }).catch(() => setMessage("Anmeldung konnte nicht abgeschlossen werden."));
      return;
    }
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUser(d.user));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("Wird geprüft …");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      json = await res.json();
    if (!res.ok) return setMessage(json.error ?? "Anmeldung fehlgeschlagen");
    setUser(json.user);
    setMessage("Erfolgreich angemeldet.");
  }
  async function logout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    setUser(null);
  }
  return (
    <main className="account-page">
      <a className="brand account-brand" href="/">
        <span className="brand-mark">CH</span>
        <span>
          CONVOY<span>HUB</span>
        </span>
      </a>
      <section className="account-card">
        {user ? (
          <div className="account-success">
            <span className="status-pill">
              <i /> KONTO AKTIV
            </span>
            <h1>Willkommen, {user.displayName}</h1>
            <p>{user.email ?? "Steam-/Discord-Konto"}</p>
            <ImageUploader
              purpose="avatar"
              label="Dein Fahrer-Profilbild"
              current={user.avatarUrl}
              onUploaded={(u) => setUser({ ...user, avatarUrl: u.url })}
            />
            <div className="connected-box">
              <strong>Deine Verknüpfungen</strong>
              <a href="/api/auth/google/start">Google verbinden →</a>
              <a href="/api/auth/discord/start">Discord verbinden →</a>
              <a href="/api/auth/steam/start">Steam verbinden →</a>
              <a href="/konto/sicherheit">Sicherheit, Geräte & Datenschutz →</a>
            </div>
            <a className="primary" href="/dashboard">
              Zum Dashboard
            </a>
            <button className="text-button" onClick={logout}>
              Abmelden
            </button>
          </div>
        ) : (
          <>
            <span className="kicker">DEIN FAHRERKONTO</span>
            <h1>
              {mode === "login"
                ? "Willkommen zurück."
                : "Starte deine Karriere."}
            </h1>
            <p>Ein Konto für alle Speditionen, Fahrten und Events.</p>
            <div className="oauth-grid">
              <a href="/api/auth/google/start">
                <b>GOOGLE</b>
                <span>Mit Google anmelden</span>
              </a>
              <a href="/api/auth/steam/start">
                <b>STEAM</b>
                <span>Mit Steam anmelden</span>
              </a>
              <a href="/api/auth/discord/start">
                <b>DISCORD</b>
                <span>Mit Discord anmelden</span>
              </a>
            </div>
            <div className="or">
              <span />
              ODER MIT E-MAIL
              <span />
            </div>
            <form onSubmit={submit}>
              {mode === "register" && (
                <label>
                  Fahrername
                  <input
                    name="displayName"
                    minLength={2}
                    required
                    placeholder="Dein Name im Spiel"
                  />
                </label>
              )}
              {mode === "login" && (
                <label>
                  Zwei-Faktor-Code (falls aktiviert)
                  <input
                    name="twoFactorCode"
                    inputMode="numeric"
                    placeholder="6-stellig oder Wiederherstellungscode"
                  />
                </label>
              )}
              <label>
                E-Mail
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="fahrer@beispiel.de"
                />
              </label>
              <label>
                Passwort
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                  placeholder="Mindestens 10 Zeichen"
                />
              </label>
              {mode === "register" && (
                <>
                  <label className="account-consent">
                    <input
                      name="acceptRules"
                      type="checkbox"
                      value="true"
                      required
                    />{" "}
                    Regeln akzeptieren
                  </label>
                  <label className="account-consent">
                    <input
                      name="acceptPrivacy"
                      type="checkbox"
                      value="true"
                      required
                    />{" "}
                    Datenschutz akzeptieren
                  </label>
                </>
              )}
              <button className="primary" type="submit">
                {mode === "login" ? "Anmelden" : "Konto erstellen"}
              </button>
            </form>
            {mode === "login" && (
              <a className="password-help-link" href="/konto/passwort">
                Passwort vergessen?
              </a>
            )}
            {message && <p className="form-message">{message}</p>}
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setMessage("");
              }}
            >
              {mode === "login"
                ? "Noch kein Konto? Jetzt registrieren"
                : "Bereits registriert? Anmelden"}
            </button>
          </>
        )}
      </section>
      <aside className="account-aside">
        <span>CONVOYHUB ID</span>
        <h2>
          Eine Identität.
          <br />
          Jede Spedition.
        </h2>
        <ul>
          <li>Steam und Discord sicher verknüpfen</li>
          <li>Fahrten und Karriere überall mitnehmen</li>
          <li>Sitzungen jederzeit verwalten</li>
          <li>Datenschutzfreundliche Live-Positionen</li>
        </ul>
      </aside>
    </main>
  );
}

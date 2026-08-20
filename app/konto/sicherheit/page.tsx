"use client";
import { useEffect, useState } from "react";
export default function Security() {
  const [data, setData] = useState<any>(),
    [setup, setSetup] = useState<any>(),
    [message, setMessage] = useState("");
  async function load() {
    const r = await fetch("/api/auth/security");
    if (r.status === 401) {
      location.href = "/konto";
      return;
    }
    setData(await r.json());
  }
  useEffect(() => {
    load();
  }, []);
  async function act(body: any) {
    const r = await fetch("/api/auth/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      j = await r.json();
    if (!r.ok) {
      setMessage(j.error);
      return j;
    }
    setMessage("Änderung gespeichert.");
    if (body.action === "setup2fa") setSetup(j);
    if (body.action === "enable2fa") {
      setSetup({ ...setup, recoveryCodes: j.recoveryCodes });
      await load();
    } else if (!["setup2fa", "export"].includes(body.action)) await load();
    return j;
  }
  async function download() {
    const r = await fetch("/api/auth/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export" }),
      }),
      blob = await r.blob(),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "vtc-truck-hub-kontoexport.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!data)
    return (
      <main className="manage-loading">Sicherheitscenter wird geladen …</main>
    );
  return (
    <main className="security-page">
      <header>
        <div>
          <span className="kicker">KONTO & DATENSCHUTZ</span>
          <h1>Sicherheitscenter</h1>
        </div>
        <a href="/konto">Zurück zum Konto</a>
      </header>
      {message && <p className="manage-message">{message}</p>}
      <div className="security-grid">
        <section id="passwort">
          <h2>Passwort ändern</h2>
          <form onSubmit={(e)=>{e.preventDefault();act({action:"changePassword",...Object.fromEntries(new FormData(e.currentTarget))});e.currentTarget.reset()}}>
            <label>Aktuelles Passwort<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label>Neues Passwort<input name="newPassword" type="password" minLength={10} autoComplete="new-password" required /></label>
            <label>Neues Passwort wiederholen<input name="confirmPassword" type="password" minLength={10} autoComplete="new-password" required /></label>
            <button>Passwort sicher ändern</button>
          </form>
        </section>
        <section>
          <h2>E-Mail-Bestätigung</h2>
          <p>
            {data.security.emailVerifiedAt
              ? `Bestätigt am ${new Date(data.security.emailVerifiedAt).toLocaleString("de-DE")}`
              : "Noch nicht bestätigt"}
          </p>
          {!data.security.emailVerifiedAt && (
            <button
              onClick={() =>
                act({ action: "requestVerification", email: data.user?.email })
              }
            >
              Bestätigungs-E-Mail anfordern
            </button>
          )}
        </section>
        <section>
          <h2>Zwei-Faktor-Authentifizierung</h2>
          <p>
            {data.security.twoFactorEnabled
              ? "Aktiv – Anmeldung ist zusätzlich geschützt."
              : "Noch nicht aktiviert."}
          </p>
          {!data.security.twoFactorEnabled && !setup && (
            <button onClick={() => act({ action: "setup2fa" })}>
              2FA einrichten
            </button>
          )}
          {setup && !setup.recoveryCodes && (
            <>
              <code className="totp-secret">{setup.secret}</code>
              <p>Secret in eine Authenticator-App eintragen.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act({
                    action: "enable2fa",
                    code: new FormData(e.currentTarget).get("code"),
                  });
                }}
              >
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  placeholder="6-stelliger Code"
                  required
                />
                <button>Aktivieren</button>
              </form>
            </>
          )}
          {setup?.recoveryCodes && (
            <div className="recovery-codes">
              <b>Wiederherstellungscodes – jetzt sicher speichern</b>
              {setup.recoveryCodes.map((x: string) => (
                <code key={x}>{x}</code>
              ))}
            </div>
          )}
          {data.security.twoFactorEnabled && (
            <button onClick={() => act({ action: "disable2fa" })}>
              2FA deaktivieren
            </button>
          )}
        </section>
        <section className="sessions">
          <h2>Geräte und Sitzungen</h2>
          {data.sessions.map((s: any) => (
            <article key={s.id}>
              <div>
                <b>
                  {s.current
                    ? "Dieses Gerät"
                    : s.userAgent || "Unbekanntes Gerät"}
                </b>
                <small>
                  Angemeldet {new Date(s.createdAt).toLocaleString("de-DE")} ·
                  gültig bis {new Date(s.expiresAt).toLocaleDateString("de-DE")}
                </small>
              </div>
              {!s.current && (
                <button
                  onClick={() => act({ action: "revokeSession", id: s.id })}
                >
                  Abmelden
                </button>
              )}
            </article>
          ))}
          <button onClick={() => act({ action: "logoutOthers" })}>
            Alle anderen Geräte abmelden
          </button>
        </section>
        <section>
          <h2>Verknüpfte Konten</h2>
          {data.links.map((x: any) => (
            <p key={x.provider}>
              <b>{x.provider}</b> · {x.username || x.providerId}
            </p>
          ))}
          <a href="/api/auth/steam/start">Steam verbinden</a>
          <a href="/api/auth/discord/start">Discord verbinden</a>
        </section>
        <section>
          <h2>Login-Verlauf</h2>
          {data.events.length ? (
            data.events.map((x: any, i: number) => (
              <p key={i}>
                <b>{x.type}</b> · {x.severity} ·{" "}
                {new Date(x.createdAt).toLocaleString("de-DE")}
              </p>
            ))
          ) : (
            <p>Keine Sicherheitswarnungen.</p>
          )}
        </section>
        <section>
          <h2>Datenexport</h2>
          <p>
            Exportiert Kontodaten, Mitgliedschaften, Fahrten, Bewerbungen und
            Abrechnungen als JSON.
          </p>
          <button onClick={download}>Meine Daten herunterladen</button>
        </section>
        <section className="danger-zone">
          <h2>Kontolöschung</h2>
          <p>
            Die Löschung wird vorgemerkt und meldet alle Geräte ab. Gesetzliche
            Aufbewahrungsfristen bleiben berücksichtigt.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act({
                action: "requestDeletion",
                confirm: new FormData(e.currentTarget).get("confirm"),
              });
            }}
          >
            <input name="confirm" placeholder="KONTO LÖSCHEN" required />
            <button>Löschung verbindlich anfordern</button>
          </form>
        </section>
      </div>
    </main>
  );
}

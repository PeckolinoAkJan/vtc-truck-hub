"use client";
import { FormEvent, useEffect, useState } from "react";
import ImageUploader from "../components/ImageUploader";
type User = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  locale?: string | null;
  timezone?: string | null;
  publicDisplayName?: number | boolean;
};
export default function Account() {
  const [user, setUser] = useState<User | null>(null),
    [mode, setMode] = useState<"login" | "register">("login"),
    [message, setMessage] = useState(""),
    [clientAccess,setClientAccess]=useState<any[]>([]),
    [clientKey,setClientKey]=useState(""),
    [clientMessage,setClientMessage]=useState("");
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
  useEffect(()=>{if(!user)return;fetch("/api/v1/client-access").then(r=>r.ok?r.json():null).then(d=>d&&setClientAccess(d.memberships??[])).catch(()=>{})},[user]);
  async function createClientKey(vtcId:string){
    setClientMessage("Persönlicher Schlüssel wird erstellt …");setClientKey("");
    const response=await fetch("/api/v1/client-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vtcId})}),data=await response.json();
    if(!response.ok)return setClientMessage(data.error??"Schlüssel konnte nicht erstellt werden.");
    setClientKey(data.key);setClientMessage(`${data.vtc.name}: Schlüssel jetzt in den Desktop-Client kopieren.`);
    const fresh=await fetch("/api/v1/client-access").then(r=>r.json());setClientAccess(fresh.memberships??[]);
  }
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
  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/auth/me", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...values,publicDisplayName:values.publicDisplayName==="true"})});
    const json = await res.json();
    if (!res.ok) return setMessage(json.error ?? "Profil konnte nicht gespeichert werden.");
    const fresh = await fetch("/api/auth/me").then(r=>r.json());
    setUser(fresh.user);
    setMessage("Profil wurde gespeichert.");
  }
  return (
    <main className="account-page">
      <a className="brand account-brand" href="/">
        <span className="brand-mark">VH</span>
        <span>
          VTC TRUCK <span>HUB</span>
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
            <form className="account-profile-form" onSubmit={saveProfile}>
              <h2>Persönliche Daten bearbeiten</h2>
              <label>Anzeigename<input name="displayName" defaultValue={user.displayName} minLength={2} required /></label>
              <div className="account-profile-grid"><label>Vorname<input name="firstName" defaultValue={user.firstName??""} /></label><label>Nachname<input name="lastName" defaultValue={user.lastName??""} /></label></div>
              <label>Straße und Hausnummer<input name="street" defaultValue={user.street??""} autoComplete="street-address" /></label>
              <div className="account-profile-grid"><label>PLZ<input name="postalCode" defaultValue={user.postalCode??""} autoComplete="postal-code" /></label><label>Stadt<input name="city" defaultValue={user.city??""} autoComplete="address-level2" /></label></div>
              <div className="account-profile-grid"><label>Land<input name="country" defaultValue={user.country??"Deutschland"} autoComplete="country-name" /></label><label>Telefon<input name="phone" defaultValue={user.phone??""} type="tel" autoComplete="tel" /></label></div>
              <div className="account-profile-grid"><label>Sprache<select name="locale" defaultValue={user.locale??"de"}><option value="de">Deutsch</option><option value="en">English</option></select></label><label>Zeitzone<input name="timezone" defaultValue={user.timezone??"Europe/Berlin"} /></label></div>
              <label className="account-consent"><input name="publicDisplayName" type="checkbox" value="true" defaultChecked={user.publicDisplayName!==0} /> Anzeigename im Fahrerprofil öffentlich zeigen</label>
              <p className="privacy-note">Adresse und Telefonnummer bleiben privat und sind nicht auf öffentlichen Fahrerprofilen sichtbar.</p>
              <button className="primary">Profil speichern</button>
            </form>
            <div className="connected-box">
              <strong>Deine Verknüpfungen</strong>
              <a href="/api/auth/google/start">Google verbinden →</a>
              <a href="/api/auth/discord/start">Discord verbinden →</a>
              <a href="/api/auth/steam/start">Steam verbinden →</a>
              <a href="/konto/sicherheit">Sicherheit, Geräte & Datenschutz →</a>
              <a href="/konto/sicherheit#passwort">Passwort ändern →</a>
            </div>
            <section className="client-connect-box">
              <div><span>DESKTOP-CLIENT</span><h2>Telemetrie sicher verbinden</h2><p>Jeder Fahrer erhält einen eigenen Schlüssel pro Spedition. Er funktioniert ausschließlich für deine Mitgliedschaft und kann jederzeit erneuert werden.</p></div>
              {clientAccess.length?clientAccess.map((entry:any)=><article key={entry.id}><div><b>{entry.tag} · {entry.name}</b><small>{entry.roleName||"Mitglied"} · {entry.prefix?`Aktiver Schlüssel ${entry.prefix}…`:"Noch kein Schlüssel erstellt"}</small></div><button type="button" onClick={()=>createClientKey(entry.id)}>{entry.prefix?"Schlüssel erneuern":"Schlüssel erstellen"}</button></article>):<p className="client-empty">Nach der Zuordnung zu einer Spedition erscheint hier dein persönlicher Telemetrie-Schlüssel.</p>}
              {clientMessage&&<p className="client-key-message">{clientMessage}</p>}
              {clientKey&&<div className="client-key-once"><strong>NUR EINMAL SICHTBAR</strong><code>{clientKey}</code><button type="button" onClick={()=>navigator.clipboard.writeText(clientKey)}>Schlüssel kopieren</button><ol><li>VTC Truck Hub Desktop-Client öffnen</li><li>Einstellungen → Verbindung</li><li>Server <b>https://vtc-truck-hub.de</b> und diesen Schlüssel eintragen</li></ol></div>}
              <a className="client-download-account" href="/downloads">Client-Download und aktuelle Version →</a>
            </section>
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
        <span>VTC TRUCK HUB ID</span>
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

"use client";
import { FormEvent, useEffect, useState } from "react";
import ImageUploader from "../components/ImageUploader";

const permissionOptions = [
  ["view_management", "Verwaltung ansehen"],
  ["manage_drivers", "Fahrer verwalten"],
  ["manage_applications", "Bewerbungen bearbeiten"],
  ["warn_drivers", "Warnungen ausstellen"],
  ["terminate_drivers", "Kündigungen durchführen"],
  ["review_trips", "Fahrten prüfen und freigeben"],
  ["manage_dispatch", "Aufträge disponieren"],
  ["manage_fleet", "Fahrzeuge verwalten"],
  ["manage_payroll", "Lohnabrechnungen"],
  ["manage_events", "Events verwalten"],
  ["manage_gallery", "Galerie moderieren"],
  ["publish_news", "News veröffentlichen"],
  ["manage_partnerships", "Partnerschaften"],
  ["manage_discord", "Discord-Synchronisierung"],
  ["manage_roles", "Rollen verwalten"],
  ["manage_settings", "Einstellungen ändern"],
  ["view_audit", "Audit-Protokoll"],
  ["view_sensitive_personnel", "Sensible Personalakten"],
];
type Role = {
  id: string;
  name: string;
  color: string;
  rank: number;
  permissions: string[];
  protected: number;
};
type Department = { id: string; name: string; color: string };
type Driver = {
  userId: string;
  email: string;
  displayName: string;
  driverNumber: string;
  membershipStatus: string;
  department: string;
  roleId: string;
  roleName: string;
  steamId?: string;
  discordId?: string;
  truckersmpId?: string;
  probationStart?: string;
  probationEnd?: string;
  branch?: string;
  mainGame?: string;
  preferredTruck?: string;
  drivingStyle?: string;
  language?: string;
  timezone?: string;
  status?: string;
  sensitiveNotes?: string;
};
type Data = {
  vtc: Record<string, unknown>;
  profile: Record<string, unknown>;
  roles: Role[];
  departments: Department[];
  drivers: Driver[];
  actions: Array<{
    id: string;
    userId: string;
    type: string;
    newValue: string;
    note: string;
    actor: string;
    createdAt: string;
  }>;
  access: { permissions: string[]; sensitive: boolean };
  discordIntegration?: { guildId?: string; displayName?: string; deliveryChannelId?: string } | null;
  discordInviteUrl?: string | null;
};
const split = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
export default function Management() {
  const [data, setData] = useState<Data | null>(null),
    [vtcId] = useState(() => typeof location === "undefined" ? "vtc-ngl" : new URLSearchParams(location.search).get("vtcId") ?? "vtc-ngl"),
    [tab, setTab] = useState("Personal"),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<Driver | null>(null);
  async function load() {
    const r = await fetch(`/api/v1/management?vtcId=${encodeURIComponent(vtcId)}`);
    if (r.status === 401 || r.status === 403) {
      location.href = "/konto";
      return;
    }
    setData(await r.json());
  }
  useEffect(() => {
    load();
  }, []);
  async function act(body: unknown) {
    const r = await fetch("/api/v1/management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vtcId, ...(body as object) }),
      }),
      j = await r.json();
    setMessage(
      r.ok ? "Änderung gespeichert." : (j.error ?? "Aktion fehlgeschlagen"),
    );
    if (r.ok) await load();
    return r.ok;
  }
  if (!data)
    return (
      <main className="manage-loading">
        Speditionsverwaltung wird geladen …
      </main>
    );
  const v = data.vtc,
    p = data.profile ?? {};
  return (
    <main className="manage-page">
      <header>
        <a className="brand" href="/">
          <span className="brand-mark">VH</span>
          <span>
            VTC TRUCK <span>HUB</span>
          </span>
        </a>
        <div>
          <span className="kicker">MEINE SPEDITION</span>
          <h1>Speditionsverwaltung</h1>
        </div>
        <a href="/dashboard">Dashboard</a>
      </header>
      <nav className="manage-tabs">
        {[
          "Personal",
          "Rollen & Rechte",
          "Abteilungen",
          "Speditionsprofil",
          "Discord-Bot",
          "Personalverlauf",
        ].map((x) => (
          <button
            key={x}
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </nav>
      {message && <p className="manage-message">{message}</p>}
      {tab === "Personal" && (
        <div className="manage-columns">
          <section className="manage-panel">
            <div className="manage-head">
              <div>
                <span className="kicker">FAHRER</span>
                <h2>{data.drivers.length} Personalakten</h2>
              </div>
            </div>
            <form
              className="manage-inline"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await act({
                    action: "addDriver",
                    email: f.get("email"),
                    roleId: f.get("roleId"),
                    departmentName: f.get("department"),
                  })
                )
                  e.currentTarget.reset();
              }}
            >
              <input
                name="email"
                type="email"
                placeholder="Konto-E-Mail"
                required
              />
              <select name="roleId">
                {data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select name="department">
                {data.departments.map((d) => (
                  <option key={d.id}>{d.name}</option>
                ))}
              </select>
              <button>Fahrer aufnehmen</button>
            </form>
            <div className="manage-driver-list">
              {data.drivers.map((d) => (
                <button
                  key={d.userId}
                  className={selected?.userId === d.userId ? "selected" : ""}
                  onClick={() => setSelected(d)}
                >
                  <span>{d.displayName.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{d.displayName}</strong>
                    <small>
                      {d.driverNumber} · {d.roleName} ·{" "}
                      {d.status ?? d.membershipStatus}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <section className="manage-panel">
            {selected ? (
              <DriverEditor driver={selected} data={data} save={act} />
            ) : (
              <div className="manage-empty">
                <h2>Personalakte öffnen</h2>
                <p>
                  Wähle links einen Fahrer, um Stammdaten, Probezeit, Status,
                  Rolle und sensible Notizen zu bearbeiten.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {tab === "Rollen & Rechte" && (
        <section className="manage-panel wide">
          <div className="role-grid">
            {data.roles.map((r) => (
              <RoleEditor key={r.id} role={r} save={act} />
            ))}
          </div>
          <RoleEditor save={act} />
        </section>
      )}
      {tab === "Abteilungen" && (
        <section className="manage-panel wide">
          <div className="department-grid">
            {data.departments.map((d) => (
              <article key={d.id}>
                <i style={{ background: d.color }} />
                <strong>{d.name}</strong>
              </article>
            ))}
          </div>
          <form
            className="manage-inline"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await act({
                  action: "saveDepartment",
                  department: { name: f.get("name"), color: f.get("color") },
                })
              )
                e.currentTarget.reset();
            }}
          >
            <input name="name" placeholder="Neue Abteilung" required />
            <input name="color" type="color" defaultValue="#22d3c5" />
            <button>Abteilung anlegen</button>
          </form>
        </section>
      )}
      {tab === "Speditionsprofil" && (
        <section className="manage-panel wide">
          <h2>Logo und Titelbild</h2>
          <p>Die Bilder werden direkt im Verzeichnis und auf der öffentlichen Speditionsseite angezeigt.</p>
          <div className="company-image-settings">
            <ImageUploader purpose="company_logo" vtcId={String(v.id)} label="Speditionslogo" current={p.logo_upload_id ? `/api/v1/uploads?id=${p.logo_upload_id}` : null}/>
            <ImageUploader purpose="company_header" vtcId={String(v.id)} label="Titelbild / Header" current={p.header_upload_id ? `/api/v1/uploads?id=${p.header_upload_id}` : null}/>
          </div>
          <form
            className="manage-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await act({
                action: "saveProfile",
                profile: {
                  name: f.get("name"),
                  tag: f.get("tag"),
                  description: f.get("description"),
                  country: f.get("country"),
                  city: f.get("city"),
                  games: f.get("games"),
                  languages: f.get("languages"),
                  timezone: f.get("timezone"),
                  truckersmpId: f.get("truckersmpId"),
                  discordUrl: f.get("discordUrl"),
                  websiteUrl: f.get("websiteUrl"),
                  applicationsOpen: f.get("applicationsOpen") === "on",
                  minimumAge: Number(f.get("minimumAge")),
                  foundedAt: f.get("foundedAt"),
                  history: f.get("history"),
                  motto: f.get("motto"),
                  mainLanguage: f.get("mainLanguage"),
                  contactName: f.get("contactName"),
                  publicStatus: f.get("publicStatus"),
                  requirements: split(f.get("requirements")),
                  rules: split(f.get("rules")),
                  probationInfo: f.get("probationInfo"),
                  partnerSeeking: f.get("partnerSeeking") === "on",
                  beginnerFriendly: f.get("beginnerFriendly") === "on",
                  drivingModes: split(f.get("drivingModes")),
                  primaryColor: f.get("primaryColor"),
                  secondaryColor: f.get("secondaryColor"),
                },
              });
            }}
          >
            <h2>Öffentliches Firmenprofil</h2>
            <div className="manage-form-grid">
              <label>
                Name
                <input
                  name="name"
                  defaultValue={String(v.name ?? "")}
                  required
                />
              </label>
              <label>
                Tag
                <input name="tag" defaultValue={String(v.tag ?? "")} required />
              </label>
              <label>
                Land
                <input
                  name="country"
                  defaultValue={String(v.country ?? "")}
                  required
                />
              </label>
              <label>
                Standort
                <input name="city" defaultValue={String(v.city ?? "")} />
              </label>
              <label>
                Spiele
                <input name="games" defaultValue={String(v.games ?? "")} />
              </label>
              <label>
                Sprachen
                <input
                  name="languages"
                  defaultValue={String(v.languages ?? "")}
                />
              </label>
              <label>
                Hauptsprache
                <input
                  name="mainLanguage"
                  defaultValue={String(p.main_language ?? "")}
                />
              </label>
              <label>
                Zeitzone
                <input
                  name="timezone"
                  defaultValue={String(v.timezone ?? "")}
                />
              </label>
              <label>
                Gründungsdatum
                <input
                  name="foundedAt"
                  type="date"
                  defaultValue={String(p.founded_at ?? "")}
                />
              </label>
              <label>
                Mindestalter
                <input
                  name="minimumAge"
                  type="number"
                  defaultValue={Number(v.minimumAge ?? 16)}
                />
              </label>
              <label>
                TruckersMP-ID
                <input
                  name="truckersmpId"
                  defaultValue={String(v.truckersmpId ?? "")}
                />
              </label>
              <label>
                Ansprechpartner
                <input
                  name="contactName"
                  defaultValue={String(p.contact_name ?? "")}
                />
              </label>
              <label>
                Discord-Link
                <input
                  name="discordUrl"
                  defaultValue={String(v.discordUrl ?? "")}
                />
              </label>
              <label>
                Webseite
                <input
                  name="websiteUrl"
                  defaultValue={String(v.websiteUrl ?? "")}
                />
              </label>
              <label>
                Status
                <select
                  name="publicStatus"
                  defaultValue={String(p.public_status ?? "public")}
                >
                  <option value="public">Öffentlich</option>
                  <option value="private">Privat</option>
                  <option value="paused">Pausiert</option>
                </select>
              </label>
              <label>
                Primärfarbe
                <input
                  name="primaryColor"
                  type="color"
                  defaultValue={String(p.primary_color ?? "#22d3c5")}
                />
              </label>
              <label>
                Sekundärfarbe
                <input
                  name="secondaryColor"
                  type="color"
                  defaultValue={String(p.secondary_color ?? "#0d202d")}
                />
              </label>
            </div>
            <label>
              Beschreibung
              <textarea
                name="description"
                defaultValue={String(v.description ?? "")}
              />
            </label>
            <label>
              Motto
              <input name="motto" defaultValue={String(p.motto ?? "")} />
            </label>
            <label>
              Unternehmensgeschichte
              <textarea name="history" defaultValue={String(p.history ?? "")} />
            </label>
            <label>
              Voraussetzungen – eine je Zeile
              <textarea
                name="requirements"
                defaultValue={jsonLines(p.requirements)}
              />
            </label>
            <label>
              Firmenregeln – eine je Zeile
              <textarea name="rules" defaultValue={jsonLines(p.rules)} />
            </label>
            <label>
              Probezeitinformationen
              <textarea
                name="probationInfo"
                defaultValue={String(p.probation_info ?? "")}
              />
            </label>
            <label>
              Fahrweisen – eine je Zeile
              <textarea
                name="drivingModes"
                defaultValue={jsonLines(p.driving_modes)}
              />
            </label>
            <div className="manage-checks">
              <label>
                <input
                  name="applicationsOpen"
                  type="checkbox"
                  defaultChecked={Boolean(v.applicationsOpen)}
                />{" "}
                Bewerbungen geöffnet
              </label>
              <label>
                <input
                  name="partnerSeeking"
                  type="checkbox"
                  defaultChecked={Boolean(p.partner_seeking)}
                />{" "}
                Partner gesucht
              </label>
              <label>
                <input
                  name="beginnerFriendly"
                  type="checkbox"
                  defaultChecked={Boolean(p.beginner_friendly)}
                />{" "}
                Anfängerfreundlich
              </label>
            </div>
            <button className="primary">Profil speichern</button>
          </form>
        </section>
      )}
      {tab === "Discord-Bot" && (
        <section className="manage-panel wide discord-vtc-panel">
          <div className="discord-vtc-hero">
            <div><span className="kicker">VTC TRUCK HUB BOT</span><h2>Aufträge automatisch an Discord melden</h2><p>Lade den Bot auf deinen Server ein und hinterlege danach Server-ID und Kanal-ID. Jeder im Spiel abgegebene Auftrag wird einmalig als übersichtliche Einbettung gesendet.</p></div>
            {data.discordInviteUrl ? <a className="primary" href={data.discordInviteUrl} target="_blank" rel="noreferrer">Bot zu Discord einladen</a> : <span className="manage-warning">Bot-Einladung ist noch nicht zentral konfiguriert.</span>}
          </div>
          <ol className="discord-steps"><li>Bot einladen und Berechtigungen bestätigen</li><li>Discord-Entwicklermodus aktivieren und IDs kopieren</li><li>Auftragskanal unten speichern</li></ol>
          <form className="manage-form" onSubmit={async (event) => {event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));await act({action:"saveDiscordIntegration",discord:values});}}>
            <div className="manage-form-grid">
              <label>Servername (intern)<input name="displayName" defaultValue={data.discordIntegration?.displayName ?? ""} placeholder="Meine Spedition" /></label>
              <label>Discord-Server-ID<input name="guildId" inputMode="numeric" pattern="[0-9]{17,20}" defaultValue={data.discordIntegration?.guildId ?? ""} placeholder="123456789012345678" required /></label>
              <label>Auftragskanal-ID<input name="deliveryChannelId" inputMode="numeric" pattern="[0-9]{17,20}" defaultValue={data.discordIntegration?.deliveryChannelId ?? ""} placeholder="123456789012345678" required /></label>
            </div>
            <div className="discord-embed-preview"><span>VORSCHAU</span><h3>✅ Auftrag abgegeben</h3><div><b>Fahrer</b><b>Spiel</b><b>Distanz</b><small>Max Mustermann</small><small>ETS2</small><small>842,4 km</small></div><p>Hamburg → Mailand · Fracht: Maschinen · wartet auf Fahrerbestätigung</p></div>
            <button>Discord-Auftragskanal speichern</button>
          </form>
        </section>
      )}
      {tab === "Personalverlauf" && (
        <section className="manage-panel wide">
          <div className="history-list">
            {data.actions.map((a) => (
              <article key={a.id}>
                <strong>{a.type}</strong>
                <span>
                  {data.drivers.find((d) => d.userId === a.userId)
                    ?.displayName ?? a.userId}
                </span>
                <p>
                  {a.newValue} {a.note}
                </p>
                <small>
                  {new Date(a.createdAt).toLocaleString("de-DE")} · {a.actor}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function jsonLines(value: unknown) {
  try {
    return (JSON.parse(String(value ?? "[]")) as string[]).join("\n");
  } catch {
    return "";
  }
}
function RoleEditor({
  role,
  save,
}: {
  role?: Role;
  save: (body: unknown) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(!role);
  return (
    <article className="role-card">
      <button className="role-title" onClick={() => setOpen(!open)}>
        <i style={{ background: role?.color ?? "#22d3c5" }} />
        <strong>{role?.name ?? "Neue Rolle"}</strong>
        <span>Rang {role?.rank ?? 0}</span>
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await save({
              action: "saveRole",
              role: {
                id: role?.id,
                name: f.get("name"),
                color: f.get("color"),
                rank: Number(f.get("rank")),
                permissions: permissionOptions
                  .filter(([key]) => f.get(key) === "on")
                  .map(([key]) => key),
                protected: Boolean(role?.protected),
              },
            });
          }}
        >
          <div className="manage-form-grid">
            <label>
              Name
              <input name="name" defaultValue={role?.name} required />
            </label>
            <label>
              Farbe
              <input
                name="color"
                type="color"
                defaultValue={role?.color ?? "#22d3c5"}
              />
            </label>
            <label>
              Rang
              <input
                name="rank"
                type="number"
                min="0"
                max="100"
                defaultValue={role?.rank ?? 10}
              />
            </label>
          </div>
          <div className="permission-grid">
            {permissionOptions.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={
                    role?.permissions.includes("*") ||
                    role?.permissions.includes(key)
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <button>Rolle speichern</button>
        </form>
      )}
    </article>
  );
}
function DriverEditor({
  driver,
  data,
  save,
}: {
  driver: Driver;
  data: Data;
  save: (body: unknown) => Promise<boolean>;
}) {
  return (
    <div>
      <span className="kicker">PERSONALAKTE</span>
      <h2>{driver.displayName}</h2>
      <p>
        {driver.email} · {driver.driverNumber}
      </p>
      <form
        className="manage-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          await save({
            action: "updateDriver",
            userId: driver.userId,
            driver: f,
          });
        }}
      >
        <div className="manage-form-grid">
          <label>
            Rolle
            <select name="roleId" defaultValue={driver.roleId}>
              {data.roles.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Abteilung
            <select name="department" defaultValue={driver.department}>
              {data.departments.map((d) => (
                <option key={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label>
            Mitgliedschaft
            <select
              name="membershipStatus"
              defaultValue={driver.membershipStatus}
            >
              {[
                "active",
                "probation",
                "leave",
                "sick",
                "inactive",
                "suspended",
                "terminated",
                "resigned",
                "blocked",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Personalstatus
            <select name="status" defaultValue={driver.status}>
              {[
                "active",
                "probation",
                "leave",
                "sick",
                "inactive",
                "suspended",
                "terminated",
                "resigned",
                "blocked",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Steam-ID
            <input name="steamId" defaultValue={driver.steamId} />
          </label>
          <label>
            Discord-ID
            <input name="discordId" defaultValue={driver.discordId} />
          </label>
          <label>
            TruckersMP-ID
            <input name="truckersmpId" defaultValue={driver.truckersmpId} />
          </label>
          <label>
            Niederlassung
            <input name="branch" defaultValue={driver.branch} />
          </label>
          <label>
            Hauptspiel
            <input name="mainGame" defaultValue={driver.mainGame} />
          </label>
          <label>
            Bevorzugter LKW
            <input name="preferredTruck" defaultValue={driver.preferredTruck} />
          </label>
          <label>
            Fahrweise
            <input name="drivingStyle" defaultValue={driver.drivingStyle} />
          </label>
          <label>
            Sprache
            <input name="language" defaultValue={driver.language} />
          </label>
          <label>
            Zeitzone
            <input name="timezone" defaultValue={driver.timezone} />
          </label>
          <label>
            Probezeitbeginn
            <input
              name="probationStart"
              type="date"
              defaultValue={driver.probationStart?.slice(0, 10)}
            />
          </label>
          <label>
            Probezeitende
            <input
              name="probationEnd"
              type="date"
              defaultValue={driver.probationEnd?.slice(0, 10)}
            />
          </label>
        </div>
        {data.access.sensitive && (
          <label>
            Sensible Personalnotizen
            <textarea
              name="sensitiveNotes"
              defaultValue={driver.sensitiveNotes}
            />
          </label>
        )}
        <button>Personalakte speichern</button>
      </form>
      <form
        className="manage-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await save({
              action: "personnelAction",
              userId: driver.userId,
              personnelAction: {
                type: f.get("type"),
                newValue: f.get("newValue"),
                note: f.get("note"),
              },
            })
          )
            e.currentTarget.reset();
        }}
      >
        <select name="type">
          <option value="status_change">Statusänderung</option>
          <option value="promotion">Beförderung</option>
          <option value="transfer">Versetzung</option>
          <option value="warning">Abmahnung</option>
          <option value="praise">Lob</option>
          <option value="vacation">Urlaub</option>
          <option value="termination">Kündigung</option>
          <option value="rehire">Wiederaufnahme</option>
        </select>
        <select name="newValue">
          <option value="active">Aktiv</option>
          <option value="probation">Probezeit</option>
          <option value="leave">Beurlaubt</option>
          <option value="sick">Abwesend</option>
          <option value="inactive">Inaktiv</option>
          <option value="suspended">Suspendiert</option>
          <option value="terminated">Gekündigt</option>
          <option value="resigned">Ausgetreten</option>
          <option value="blocked">Gesperrt</option>
        </select>
        <input name="note" placeholder="Begründung/Notiz" />
        <button>Aktion erfassen</button>
      </form>
    </div>
  );
}

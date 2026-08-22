"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import FounderExtended from "./FounderExtended";
import FounderContent from "./FounderContent";

type Economy = { centsPerKm: number; jobBonusCents: number; damagePenalty: number; monthlyLimit: number; speedRules: string; pointPrices: string };
type AdminData = {
  founder: { id: string; email: string; displayName: string };
  economy: Economy[];
  payrolls: Array<{ id: string; vtcId: string; driver: string; period: string; status: string; netCents: number }>;
  tickets: Array<{ id: string; number: number; subject: string; category: string; status: string; priority: string }>;
  discord: Array<Record<string, any>>;
  rules: Array<{ id: string; guildId: string; title: string; body: string }>;
  stats: { trips: number; interrupted: number; cancelled: number; payrollsPending: number; ticketsOpen: number; activePoints: number };
  users: Array<Record<string, any>>; vtcs: Array<Record<string, any>>; reports: Array<Record<string, any>>;
  reviews: Array<Record<string, any>>; downloads: Array<Record<string, any>>; flags: Array<Record<string, any>>;
  services: Array<Record<string, any>>; backups: Array<Record<string, any>>; versions: Array<Record<string, any>>;
  security: Array<Record<string, any>>; moderation: Array<Record<string, any>>; audit: Array<Record<string, any>>;
};

const tabs = ["Übersicht", "Startseite & News", "Wikipedia", "Wirtschaft & Punkte", "Abrechnungen", "Discord-Bot", "Support-Tickets", "Benutzer & Speditionen", "Moderation", "System & Features", "Clientversionen & Backups", "Audit & Sicherheit"];

async function adminAction(body: unknown) {
  const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Aktion fehlgeschlagen");
  return result;
}

export default function Founder() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Übersicht");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) { location.replace("/admin/login"); return; }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Adminbereich konnte nicht geladen werden");
    setData(result);
  }, []);

  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))); }, [load]);

  async function run(body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await adminAction(body); await load(); setNotice(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function saveEconomy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    let speedRules: unknown, pointPrices: unknown;
    try { speedRules = JSON.parse(String(values.speedRules)); pointPrices = JSON.parse(String(values.pointPrices)); }
    catch { setError("Die Geschwindigkeits- oder Preisstaffel enthält ungültiges JSON."); return; }
    await run({ action: "saveEconomy", economy: { centsPerKm: Number(values.centsPerKm), jobBonusCents: Number(values.jobBonusCents), damagePenalty: Number(values.damagePenalty), monthlyLimit: Number(values.monthlyLimit), speedRules, pointPrices } }, "Wirtschafts- und Punktesystem gespeichert.");
  }

  const metrics = useMemo(() => data ? [["Fahrten", data.stats.trips], ["Unterbrochen", data.stats.interrupted], ["Abgebrochen", data.stats.cancelled], ["Lohnfreigaben", data.stats.payrollsPending], ["Offene Tickets", data.stats.ticketsOpen], ["Aktive Punkte", data.stats.activePoints]] : [], [data]);
  if (!data) return <main className="founder-loading">{error || "Gründerrechte werden geprüft …"}</main>;
  const economy = data.economy[0], discord = data.discord[0] ?? {};

  return <main className="founder-shell" aria-busy={busy}>
    <aside>
      <a className="brand" href="/" aria-label="VTC Truck Hub Startseite"><span className="brand-mark">VH</span><span>VTC TRUCK <span>HUB</span></span></a>
      <small>PLATTFORM-ADMINISTRATION</small><strong>{data.founder.displayName}</strong><span>{data.founder.email}</span>
      <a className="discord-admin-link" href="/gruender/discord-bot">Discord-Bot erweitern</a>
      <nav aria-label="Adminbereiche">{tabs.map((name) => <button type="button" className={tab === name ? "active" : ""} onClick={() => { setTab(name); setError(""); setNotice(""); }} key={name}>{name}</button>)}</nav>
      <a href="/dashboard">Zum VTC-Dashboard</a>
    </aside>
    <section className="founder-main">
      <header><div><span className="kicker">PLATTFORMKONTROLLE</span><h1>{tab}</h1></div><b>{busy ? "ÄNDERUNG WIRD GESPEICHERT …" : "GRÜNDERZUGANG AKTIV"}</b></header>
      {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
      {tab === "Übersicht" && <><div className="admin-metrics">{metrics.map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</div><div className="admin-callout"><span>SICHERHEITSKETTE</span><h2>Auftrag → Unterbrechung → Fortsetzung → Abrechnung → Auszahlung</h2><p>Jeder Statuswechsel wird serverseitig gespeichert und im Audit-Protokoll festgehalten.</p></div></>}
      {(tab === "Startseite & News" || tab === "Wikipedia") && <FounderContent mode={tab} />}
      {tab === "Wirtschaft & Punkte" && <form className="admin-form" onSubmit={saveEconomy}><h2>Globale Regeln</h2><div className="admin-grid"><label>Cent pro Kilometer<input name="centsPerKm" type="number" min="0" defaultValue={economy?.centsPerKm ?? 45} required /></label><label>Auftragsbonus in Cent<input name="jobBonusCents" type="number" min="0" defaultValue={economy?.jobBonusCents ?? 2500} required /></label><label>Schadensabzug je Prozent<input name="damagePenalty" type="number" min="0" defaultValue={economy?.damagePenalty ?? 200} required /></label><label>Punkteabbau pro Monat<input name="monthlyLimit" type="number" min="0" defaultValue={economy?.monthlyLimit ?? 10} required /></label></div><label>Geschwindigkeits- und Punktestaffel<textarea name="speedRules" spellCheck={false} defaultValue={economy?.speedRules ?? "[]"} required /></label><label>Preisstaffel für Punkteabbau<textarea name="pointPrices" spellCheck={false} defaultValue={economy?.pointPrices ?? "[]"} required /></label><button className="primary" disabled={busy}>Regeln speichern</button></form>}
      {tab === "Abrechnungen" && <div className="admin-list"><h2>Plattformweite Abrechnungsaufsicht</h2><p>Auszahlungen werden ausschließlich im Lohnbüro der jeweiligen Spedition aus ihrem eigenen VTC-Konto freigegeben. Der Plattform-Admin kann die Vorgänge hier nur prüfen.</p>{data.payrolls.length ? data.payrolls.map((payroll) => <article key={payroll.id}><div><strong>{payroll.driver ?? payroll.id}</strong><span>{payroll.period} · {payroll.status} · VTC {payroll.vtcId}</span></div><b>{(payroll.netCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }).replace("€", "V€")}</b></article>) : <p>Keine Abrechnung vorhanden.</p>}</div>}
      {tab === "Discord-Bot" && <div className="admin-list"><h2>Bot-Konfiguration</h2><p>Willkommen, automatische Rollen, Regeln, Ankündigungen und Ticketkanäle werden je Discord-Server gespeichert.</p><form className="admin-form" onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); run({ action: "saveDiscord", discord: { ...values, autoRoleIds: String(values.autoRoleIds ?? "").split(",").map((item) => item.trim()).filter(Boolean) } }, "Discord-Server gespeichert."); }}><div className="admin-grid"><label>Discord-Server-ID<input name="guildId" defaultValue={discord.guildId ?? ""} required /></label><label>Speditions-ID<input name="vtcId" defaultValue={discord.vtcId ?? ""} /></label><label>Willkommenskanal-ID<input name="welcomeChannelId" defaultValue={discord.welcomeChannelId ?? ""} /></label><label>Ankündigungskanal-ID<input name="announcementChannelId" defaultValue={discord.announcementChannelId ?? ""} /></label><label>Ticket-Kategorie-ID<input name="ticketCategoryId" defaultValue={discord.ticketCategoryId ?? ""} /></label><label>Support-Rollen-ID<input name="supportRoleId" defaultValue={discord.supportRoleId ?? ""} /></label><label>Automatische Rollen-IDs<input name="autoRoleIds" defaultValue={typeof discord.autoRoleIds === "string" ? discord.autoRoleIds.replace(/[\[\]"]/g, "") : ""} placeholder="123, 456" /></label></div><label>Willkommensnachricht<input name="welcomeMessage" defaultValue={discord.welcomeMessage ?? "Willkommen {user} bei {vtc}!"} /></label><button className="primary" disabled={busy}>Bot-Einstellungen speichern</button></form><form className="admin-form" onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); run({ action: "addRule", rule: values }, "Bot-Regel hinzugefügt."); }}><h3>Regel hinzufügen</h3><div className="admin-grid"><label>Server-ID<input name="guildId" defaultValue={discord.guildId ?? ""} required /></label><label>Titel<input name="title" required /></label></div><label>Regeltext<textarea name="body" required /></label><button className="primary" disabled={busy}>Regel hinzufügen</button></form><form className="admin-form" onSubmit={(event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); run({ action: "sendAnnouncement", guildId: values.guildId, message: values.message }, "Ankündigung wurde versendet."); }}><h3>Ankündigung senden</h3><label>Server-ID<input name="guildId" defaultValue={discord.guildId ?? ""} required /></label><label>Nachricht<textarea name="message" maxLength={2000} required /></label><button className="primary" disabled={busy}>Über Discord senden</button></form><h3>Aktive Regeln</h3>{data.rules.length ? data.rules.map((rule) => <article key={rule.id}><div><strong>{rule.title}</strong><span>{rule.body}</span></div></article>) : <p>Noch keine Bot-Regeln angelegt.</p>}</div>}
      {tab === "Support-Tickets" && <div className="admin-list"><h2>Support-Zentrale</h2>{data.tickets.length ? data.tickets.map((ticket) => <article key={ticket.id}><div><strong>#{ticket.number} · {ticket.subject}</strong><span>{ticket.category} · {ticket.priority} · {ticket.status}</span></div>{ticket.status !== "closed" && <button disabled={busy} onClick={() => run({ action: "updateTicket", ticketId: ticket.id, status: "closed" }, "Ticket geschlossen.")}>Schließen</button>}</article>) : <p>Keine Support-Tickets vorhanden.</p>}</div>}
      {["Benutzer & Speditionen", "Moderation", "System & Features", "Clientversionen & Backups", "Audit & Sicherheit"].includes(tab) && <FounderExtended mode={tab} data={data} onAction={run} busy={busy} />}
    </section>
  </main>;
}

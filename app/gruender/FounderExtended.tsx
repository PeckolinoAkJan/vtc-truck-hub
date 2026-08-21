"use client";

import {FormEvent,useCallback,useEffect,useState} from "react";

type Props = {
  mode: string;
  data: any;
  busy: boolean;
  onAction: (body: object, success: string) => Promise<void>;
};

export default function FounderExtended({ mode, data, busy, onAction }: Props) {
  const act = (body: object, success: string) => onAction(body, success);

  if (mode === "Benutzer & Speditionen") return <div className="admin-columns">
    <MembershipManager busy={busy} />
    <section className="admin-list">
      <h2>Alle Benutzer</h2>
      <p>Konten mit aktiver Mitgliedschaft, Fahrten oder Abrechnungen werden aus Datenschutz- und Nachweisgründen nicht gelöscht. Ausgetretene Konten ohne Historie können entfernt, alle anderen sicher gesperrt werden.</p>
      {data.users.length ? data.users.map((user: any) => {
        const protectedFounder = String(user.email ?? "").toLowerCase() === String(data.founder.email).toLowerCase();
        const identity = user.email || user.displayName || user.id;
        return <article key={user.id}>
          <div>
            <strong>{user.displayName || "Unbenannter Benutzer"}{protectedFounder ? " · Gründerkonto" : ""}</strong>
            <span>{user.email || "OAuth-Konto"} · {user.sessions} Sitzungen · {user.memberships} Mitgliedschaften</span>
          </div>
          {protectedFounder ? <b>GESCHÜTZT</b> : <div className="admin-row-actions">
            <button disabled={busy} onClick={() => confirm(`Benutzer ${identity} wirklich sperren und alle Sitzungen beenden?`) && act({ action: "suspendUser", id: user.id, data: { reason: "Durch Plattformgründer gesperrt" } }, "Benutzer gesperrt und Sitzungen beendet.")}>Sperren & abmelden</button>
            <button className="danger" disabled={busy} onClick={() => {
              const confirmation = prompt(`Nur vollständig inaktive Konten ohne Historie können gelöscht werden. Zur Bestätigung bitte exakt „${identity}“ eingeben:`);
              if (confirmation !== null) act({ action: "deleteUser", id: user.id, data: { confirmation } }, "Inaktiver Benutzer wurde dauerhaft gelöscht.");
            }}>Inaktiven Benutzer löschen</button>
          </div>}
        </article>;
      }) : <p>Keine Benutzer vorhanden.</p>}
    </section>
    <section className="admin-list">
      <h2>Alle Speditionen</h2>
      <p>Zum Löschen muss eine inaktive Spedition zuerst auf „Gesperrt“ gesetzt werden. Aktive Mitgliedschaften sowie Fahrten- oder Finanzhistorie blockieren die Löschung.</p>
      {data.vtcs.length ? data.vtcs.map((vtc: any) => <article key={vtc.id}>
        <div><strong>{vtc.name} ({vtc.tag}) {vtc.verified ? "✓" : ""}</strong><span>/{vtc.slug} · {vtc.publicStatus || "public"} · {vtc.reports} Meldungen</span></div>
        <div className="admin-row-actions">
          <button disabled={busy} onClick={() => act({ action: "verifyVtc", id: vtc.id, status: vtc.verified ? "unverified" : "verified" }, vtc.verified ? "Verifizierung entfernt." : "Spedition verifiziert.")}>{vtc.verified ? "Verifizierung entfernen" : "Verifizieren"}</button>
          <select aria-label={`Sichtbarkeit von ${vtc.name}`} disabled={busy} defaultValue={vtc.publicStatus || "public"} onChange={(event) => act({ action: "setVtcStatus", id: vtc.id, status: event.target.value }, "Speditionsstatus gespeichert.")}><option value="public">Öffentlich</option><option value="private">Privat</option><option value="blocked">Gesperrt</option></select>
          <button className="danger" disabled={busy || vtc.publicStatus !== "blocked"} title={vtc.publicStatus !== "blocked" ? "Spedition zuerst sperren" : "Leere Spedition löschen"} onClick={() => {
            const confirmation = prompt(`Diese Aktion ist endgültig. Bitte den vollständigen Speditionsnamen „${vtc.name}“ eingeben:`);
            if (confirmation !== null) act({ action: "deleteVtc", id: vtc.id, data: { confirmation } }, "Inaktive Spedition wurde dauerhaft gelöscht.");
          }}>Inaktive Spedition löschen</button>
        </div>
      </article>) : <p>Keine Speditionen vorhanden.</p>}
    </section>
  </div>;

  if (mode === "Moderation") return <div className="admin-columns">
    <section className="admin-list"><h2>Bewertungen</h2>{data.reviews.length ? data.reviews.map((review: any) => <article key={review.id}><div><strong>{review.vtc} · {review.rating}/5 · {review.author}</strong><span>{review.body} · {review.status}</span></div>{review.status === "pending" && <><button disabled={busy} onClick={() => act({ action: "moderateReview", id: review.id, status: "approved" }, "Bewertung freigegeben.")}>Freigeben</button><button disabled={busy} onClick={() => act({ action: "moderateReview", id: review.id, status: "rejected" }, "Bewertung abgelehnt.")}>Ablehnen</button></>}</article>) : <p>Keine Bewertungen zur Moderation.</p>}</section>
    <section className="admin-list"><h2>Meldungen</h2>{data.reports.length ? data.reports.map((report: any) => <article key={report.id}><div><strong>{report.entity_type} · {report.reason}</strong><span>{report.vtc || "Plattform"} · {report.detail} · {report.status}</span></div>{report.status === "open" && <button disabled={busy} onClick={() => act({ action: "resolveReport", id: report.id, status: "resolved" }, "Meldung abgeschlossen.")}>Erledigt</button>}</article>) : <p>Keine offenen Meldungen.</p>}</section>
    <section className="admin-list"><h2>Downloadfreigabe</h2>{data.downloads.length ? data.downloads.map((download: any) => <article key={download.id}><div><strong>{download.title} · {download.type}</strong><span>{download.vtc || "Plattform"} · {download.version || "ohne Version"}</span></div><button disabled={busy} onClick={() => act({ action: "approveDownload", id: download.id, status: download.approved ? "rejected" : "approved" }, download.approved ? "Downloadfreigabe entzogen." : "Download freigegeben.")}>{download.approved ? "Freigabe entziehen" : "Freigeben"}</button></article>) : <p>Keine Downloads zur Freigabe.</p>}</section>
  </div>;

  if (mode === "System & Features") return <div className="admin-columns">
    <section className="admin-list"><h2>Dienste</h2>{data.services.length ? data.services.map((service: any) => <article key={service.id}><div><strong>{service.name}</strong><span>{service.status} · {service.version || "—"} · {service.message || "Keine Statusmeldung"}</span></div></article>) : <p>Noch keine Dienststatuswerte erfasst.</p>}<form className="admin-form" onSubmit={(event) => { event.preventDefault(); act({ action: "service", data: Object.fromEntries(new FormData(event.currentTarget)) }, "Dienststatus gespeichert."); }}><input name="name" placeholder="Dienst" required /><select name="status"><option value="operational">Betriebsbereit</option><option value="degraded">Eingeschränkt</option><option value="outage">Ausfall</option><option value="maintenance">Wartung</option></select><input name="version" placeholder="Version" /><input name="message" placeholder="Statusmeldung" /><button disabled={busy}>Dienststatus speichern</button></form></section>
    <section className="admin-list"><h2>Feature-Schalter</h2>{data.flags.length ? data.flags.map((flag: any) => <article key={flag.key}><div><strong>{flag.name}</strong><span>{flag.environment} · {flag.description}</span></div><button disabled={busy} onClick={() => act({ action: "featureFlag", id: flag.key, data: { ...flag, enabled: !flag.enabled } }, flag.enabled ? "Feature deaktiviert." : "Feature aktiviert.")}>{flag.enabled ? "Deaktivieren" : "Aktivieren"}</button></article>) : <p>Noch keine Feature-Schalter angelegt.</p>}<form className="admin-form" onSubmit={(event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); act({ action: "featureFlag", id: form.key as string, data: { ...form, enabled: form.enabled === "on" } }, "Feature-Schalter gespeichert."); }}><input name="key" placeholder="feature.key" required /><input name="name" placeholder="Name" required /><input name="description" placeholder="Beschreibung" /><select name="environment"><option value="production">Produktion</option><option value="staging">Staging</option></select><label><input name="enabled" type="checkbox" /> Aktiv</label><button disabled={busy}>Feature speichern</button></form><form className="admin-form" onSubmit={(event) => { event.preventDefault(); act({ action: "systemAnnouncement", message: new FormData(event.currentTarget).get("message") }, "Systemankündigung an alle Benutzer versendet."); }}><h3>Systemankündigung</h3><textarea name="message" maxLength={3000} required /><button disabled={busy}>An alle Benutzer senden</button></form></section>
  </div>;

  if (mode === "Clientversionen & Backups") return <div className="admin-columns">
    <section className="admin-list"><h2>Client-Download verwalten</h2><p>Die neueste stabile Desktop-Client-Version wird angemeldeten Benutzern automatisch auf der Homepage angeboten.</p>{data.versions.length ? data.versions.map((version: any) => <article key={version.id}><div><strong>{version.product} {version.version}</strong><span>{version.channel} · {version.mandatory ? "Pflichtupdate" : "optional"} · {version.release_notes || "Keine Versionshinweise"}</span>{version.download_url && <a href={version.download_url} target="_blank" rel="noreferrer">Download-Link prüfen →</a>}</div></article>) : <p>Noch keine Clientversion veröffentlicht.</p>}<form className="admin-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); act({ action: "clientVersion", data: { ...Object.fromEntries(form), minimum: form.get("minimum") === "on", mandatory: form.get("mandatory") === "on" } }, "Clientversion und Download-Link veröffentlicht."); }}><input name="product" defaultValue="desktop-client" required /><input name="version" placeholder="Version, z. B. 1.0.1" required /><select name="channel"><option value="stable">stable – auf der Homepage anzeigen</option><option value="beta">beta – nur im Downloadbereich</option></select><input name="downloadUrl" type="url" placeholder="Vollständiger Download-Link" required /><input name="checksum" placeholder="SHA-256-Prüfsumme" /><textarea name="releaseNotes" placeholder="Versionshinweise" /><label><input name="minimum" type="checkbox" /> Mindestversion</label><label><input name="mandatory" type="checkbox" /> Update erzwingen</label><button disabled={busy}>Download-Link veröffentlichen</button></form></section>
    <section className="admin-list"><h2>Backups und Wiederherstellung</h2>{data.backups.length ? data.backups.map((backup: any) => <article key={backup.id}><div><strong>{backup.type} · {backup.status}</strong><span>{backup.location} · {backup.verified_at ? "verifiziert" : "nicht verifiziert"}</span></div></article>) : <p>Noch keine Backups protokolliert.</p>}<button disabled={busy} onClick={() => act({ action: "backup", data: { type: "database" } }, "Backup-Datensatz erstellt und verifiziert.")}>Backup jetzt protokollieren</button></section>
  </div>;

  if (mode === "Audit & Sicherheit") return <div className="admin-columns">
    <section className="admin-list"><h2>Audit-Protokoll</h2>{data.audit.length ? data.audit.map((entry: any, index: number) => <article key={`${entry.entityId}-${entry.createdAt}-${index}`}><div><strong>{entry.action}</strong><span>{entry.entityType} · {entry.entityId || "System"} · {entry.createdAt}</span></div></article>) : <p>Noch keine protokollierten Änderungen.</p>}</section>
    <section className="admin-list"><h2>Sicherheitsereignisse</h2>{data.security.length ? data.security.map((event: any) => <article key={event.id}><div><strong>{event.severity} · {event.type}</strong><span>{event.user || "System"} · {event.device || "kein Gerät"} · {event.created_at || ""}</span></div></article>) : <p>Keine Sicherheitsereignisse gemeldet.</p>}</section>
    <section className="admin-list"><h2>Moderationsverlauf</h2>{data.moderation.length ? data.moderation.map((item: any) => <article key={item.id}><div><strong>{item.action} · {item.entity_type}</strong><span>{item.moderator} · {item.reason || "ohne Begründung"} · {item.created_at}</span></div></article>) : <p>Noch keine Moderationsaktionen.</p>}</section>
  </div>;

  return null;
}

type MembershipData={
  users:Array<{id:string;email:string|null;displayName:string|null}>;
  vtcs:Array<{id:string;name:string;tag:string;slug:string}>;
  memberships:Array<{id:string;userId:string;vtcId:string;status:string;email:string|null;displayName:string|null;vtcName:string;roleName:string|null}>;
};

function MembershipManager({busy}:{busy:boolean}){
  const [directory,setDirectory]=useState<MembershipData|null>(null);
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState("");
  const [failure,setFailure]=useState("");
  const load=useCallback(async()=>{
    const response=await fetch("/api/admin/memberships",{cache:"no-store"});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error??"Mitgliedschaften konnten nicht geladen werden");
    setDirectory(result);
  },[]);
  useEffect(()=>{load().catch((reason)=>setFailure(reason instanceof Error?reason.message:String(reason)));},[load]);
  async function assign(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setWorking(true);setFailure("");setMessage("");
    try{
      const values=Object.fromEntries(new FormData(event.currentTarget));
      const response=await fetch("/api/admin/memberships",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"Zuordnung fehlgeschlagen");
      await load();setMessage(`Mitgliedschaft als ${result.role} wurde gespeichert.`);
    }catch(reason){setFailure(reason instanceof Error?reason.message:String(reason));}
    finally{setWorking(false);}
  }
  return <section className="admin-list admin-membership-manager">
    <h2>Benutzer einer Spedition zuordnen</h2>
    <p>Der automatische Supabase-Abgleich läuft beim Öffnen dieser Ansicht. Falls eine alte Zuordnung dort fehlt, kannst du sie hier eindeutig und ohne erfundene Daten nachtragen.</p>
    {failure&&<p className="admin-error" role="alert">{failure}</p>}{message&&<p className="admin-success" role="status">{message}</p>}
    {!directory?<p>Supabase-Zuordnungen werden abgeglichen …</p>:<>
      <form className="admin-form" onSubmit={assign}>
        <label>Registrierter Benutzer<select name="userId" required defaultValue=""><option value="" disabled>Benutzer auswählen</option>{directory.users.map(user=><option value={user.id} key={user.id}>{user.displayName||user.email||user.id} · {user.email||"OAuth-Konto"}</option>)}</select></label>
        <label>Spedition<select name="vtcId" required defaultValue=""><option value="" disabled>Spedition auswählen</option>{directory.vtcs.map(vtc=><option value={vtc.id} key={vtc.id}>{vtc.name} ({vtc.tag})</option>)}</select></label>
        <label>Rolle<select name="role" required defaultValue="driver"><option value="owner">Geschäftsführer</option><option value="admin">Administrator</option><option value="driver">Fahrer</option></select></label>
        <button className="primary" disabled={busy||working}>{working?"Zuordnung wird gespeichert …":"Mitgliedschaft speichern"}</button>
      </form>
      <h3>Aktuelle belegte Zuordnungen ({directory.memberships.length})</h3>
      {directory.memberships.length?directory.memberships.map(item=><article key={item.id}><div><strong>{item.displayName||item.email||item.userId}</strong><span>{item.email||"OAuth-Konto"} → {item.vtcName}</span></div><b>{item.roleName||"Ohne Rolle"}</b></article>):<p>Keine Mitgliedschaften vorhanden.</p>}
    </>}
  </section>;
}

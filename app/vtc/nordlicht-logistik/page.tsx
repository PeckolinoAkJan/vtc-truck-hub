"use client";

import { useState } from "react";
import DynamicVtcProfile from "../VtcProfileClient";

const drivers = [
  ["Lars_NGL", "Geschäftsführer", "428.490 km", "online"],
  ["MiaOnRoad", "Personalabteilung", "312.840 km", "online"],
  ["SvenCargo", "Eventmanagement", "287.105 km", "away"],
  ["MikaDrive", "Fahrer", "164.920 km", "offline"],
];

export default function VtcProfile(){return <DynamicVtcProfile slug="nordlicht-logistik"/>}
function LegacyVtcProfile() {
  const [followed, setFollowed] = useState(false);
  const [tab, setTab] = useState("Übersicht");
  return <main className="profile-page">
    <header className="nav compact">
      <a className="brand" href="/"><span className="brand-mark">CH</span><span>CONVOY<span>HUB</span></span></a>
      <nav><a href="/">Speditionen</a><a href="#events">Events</a><a href="#stats">Statistik</a></nav>
      <div className="nav-actions"><a className="login" href="/konto">Anmelden</a><a className="primary" href="/dashboard">Dashboard</a></div>
    </header>
    <section className="profile-cover"><div className="profile-cover-grid"/><div className="cover-inner"><span className="verified-label">✓ VERIFIZIERTE SPEDITION</span><p>EST. 2021 · HAMBURG</p></div></section>
    <section className="identity-wrap">
      <div className="identity-logo">NGL</div>
      <div className="identity-main"><div><h1>Nordlicht Logistik <span className="verified">✓</span></h1><p>NGL · Deutschland · Hamburg</p></div><div className="identity-actions"><button className={followed ? "outline following" : "outline"} onClick={() => setFollowed(!followed)}>{followed ? "✓ Gefolgt" : "+ Folgen"}</button><a className="primary apply" href="/bewerbungen">Jetzt bewerben →</a></div></div>
      <nav className="profile-tabs">{["Übersicht","Fahrer","Events","News","Galerie","Statistik"].map(item=><button key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}>{item}</button>)}</nav>
    </section>

    <div className="profile-layout">
      <div className="profile-content">
        {tab === "Übersicht" && <>
          <section className="white-panel about"><span className="kicker">ÜBER UNS</span><h2>Gemeinsam ans Ziel –<br/>vom Norden in die Welt.</h2><p>Nordlicht Logistik ist eine deutschsprachige virtuelle Spedition für ETS2 und ATS. Seit 2021 verbinden wir entspannte Feierabendtouren mit professionell organisierten Konvois, fairer Disposition und einer aktiven Community.</p><blockquote>„Nicht die schnellste Route zählt, sondern wer sie mit dir fährt.“</blockquote><div className="values"><div><strong>Realistisch</strong><span>Faire, glaubwürdige Fahrweise</span></div><div><strong>Gemeinschaftlich</strong><span>Niemand fährt allein</span></div><div><strong>Verlässlich</strong><span>Klare Regeln, starke Crew</span></div></div></section>
          <section className="white-panel"><div className="panel-head"><div><span className="kicker">UNSERE CREW</span><h2>Fahrer & Personal</h2></div><button onClick={()=>setTab("Fahrer")}>Alle 148 Fahrer →</button></div><div className="driver-list">{drivers.map(d=><div className="driver" key={d[0]}><span className={`avatar ${d[3]}`}>{d[0].slice(0,2).toUpperCase()}</span><div><strong>{d[0]}</strong><small>{d[1]}</small></div><span>{d[2]}</span></div>)}</div></section>
          <section className="white-panel" id="events"><div className="panel-head"><div><span className="kicker">KOMMENDE EVENTS</span><h2>Zusammen unterwegs</h2></div><button>Alle Events →</button></div><article className="event-card"><div className="event-date"><strong>24</strong><span>AUG</span></div><div><span className="game-tag">ETS2 · TRUCKERSMP</span><h3>Nordlicht Sommerkonvoi 2026</h3><p>Hamburg → Bergen · 1.240 km · Abfahrt 20:00 Uhr</p></div><button>Event ansehen →</button></article></section>
        </>}
        {tab === "Fahrer" && <section className="white-panel"><span className="kicker">ÖFFENTLICHE FAHRERLISTE</span><h2>148 Mitglieder</h2><div className="driver-list expanded">{[...drivers,...drivers,...drivers].map((d,i)=><div className="driver" key={`${d[0]}${i}`}><span className={`avatar ${d[3]}`}>{d[0].slice(0,2).toUpperCase()}</span><div><strong>{d[0]}{i?`_${i+1}`:""}</strong><small>{d[1]}</small></div><span>{d[2]}</span></div>)}</div></section>}
        {!["Übersicht","Fahrer"].includes(tab) && <section className="white-panel empty-state"><span className="kicker">{tab.toUpperCase()}</span><h2>{tab} von Nordlicht Logistik</h2><p>Dieser Bereich wird gerade mit den neuesten Speditionsdaten synchronisiert.</p><button className="primary" onClick={()=>setTab("Übersicht")}>Zur Übersicht</button></section>}
      </div>
      <aside>
        <section className="side-card status-card"><span className="status-pill"><i/> BEWERBUNGEN GEÖFFNET</span><h3>Werde Teil der Crew</h3><p>Wir suchen aktive Fahrer ab 16 Jahren. Einsteiger sind willkommen.</p><a href="#contact">Anforderungen ansehen →</a></section>
        <section className="side-card facts"><h3>Speditionsdetails</h3><dl><div><dt>Spiele</dt><dd>ETS2 & ATS</dd></div><div><dt>Hauptsprache</dt><dd>Deutsch</dd></div><div><dt>Weitere Sprachen</dt><dd>Englisch</dd></div><div><dt>Zeitzone</dt><dd>Europe/Berlin</dd></div><div><dt>TruckersMP VTC-ID</dt><dd>#48291</dd></div><div><dt>Mindestalter</dt><dd>16 Jahre</dd></div><div><dt>Fahrstil</dt><dd>Realistisch</dd></div></dl></section>
        <section className="side-card contact" id="contact"><h3>Kontakt & Links</h3><a href="#">Discord beitreten <span>↗</span></a><a href="#">Webseite besuchen <span>↗</span></a><a href="#">TruckersMP-Profil <span>↗</span></a><button>Profil melden</button></section>
      </aside>
    </div>
  </main>
}

"use client";

import { useState } from "react";
import DirectoryClient from "./DirectoryClient";

const companies = [
  { tag: "NGL", name: "Nordlicht Logistik", country: "Deutschland", game: "ETS2 + ATS", drivers: 148, km: "12,4 Mio.", color: "cyan", open: true, verified: true, status: "Im Konvoi" },
  { tag: "AST", name: "Asphalt Titans", country: "Österreich", game: "ETS2", drivers: 86, km: "8,9 Mio.", color: "orange", open: true, verified: true, status: "18 Fahrer online" },
  { tag: "R66", name: "Route 66 Hauling", country: "USA", game: "ATS", drivers: 64, km: "6,1 Mio.", color: "violet", open: false, verified: false, status: "7 Fahrer online" },
];

export default function Home(){return <DirectoryClient/>}
function LegacyHome() {
  const [game, setGame] = useState("Alle Spiele");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(["NGL"]);
  const filtered = companies.filter((company) =>
    (game === "Alle Spiele" || company.game.includes(game)) &&
    `${company.name} ${company.tag} ${company.country}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main>
      <header className="nav">
        <a className="brand" href="#top" aria-label="Convoy Hub Startseite"><span className="brand-mark">CH</span><span>CONVOY<span>HUB</span></span></a>
        <nav aria-label="Hauptnavigation"><a className="active" href="#directory">Speditionen</a><a href="/live-map">Live-Map</a><a href="#events">Events</a><a href="#ranking">Ranglisten</a></nav>
        <div className="nav-actions"><button className="icon-button" aria-label="Sprache wählen">DE</button><a className="login" href="/konto">Anmelden</a><a className="primary" href="/dashboard">Spedition gründen</a></div>
      </header>

      <section className="hero" id="top">
        <div className="road-lines" />
        <div className="eyebrow"><span className="live-dot" /> DIE PLATTFORM FÜR VIRTUELLE SPEDITIONEN</div>
        <h1>Deine Route.<br/><span>Deine Crew.</span></h1>
        <p>Entdecke aktive Speditionen für Euro Truck Simulator 2 und American Truck Simulator. Fahre gemeinsam, wachse zusammen.</p>
        <div className="search-shell">
          <span className="search-icon">⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Spedition, Tag oder Land suchen …" aria-label="Spedition suchen" />
          <button onClick={() => document.querySelector("#directory")?.scrollIntoView({behavior:"smooth"})}>Suchen</button>
        </div>
        <div className="hero-stats"><div><strong>1.284</strong><span>Speditionen</span></div><div><strong>38.910</strong><span>aktive Fahrer</span></div><div><strong>482 Mio.</strong><span>gefahrene km</span></div><div><strong>94</strong><span>Länder</span></div></div>
      </section>

      <section className="directory" id="directory">
        <div className="section-head"><div><span className="kicker">SPEDITIONEN ENTDECKEN</span><h2>Finde deine nächste Crew</h2><p>Von entspannt bis realistisch – hier findest du die Spedition, die zu deinem Fahrstil passt.</p></div><button className="outline">Alle 1.284 ansehen <span>→</span></button></div>
        <div className="filters">
          {['Alle Spiele','ETS2','ATS'].map((item) => <button key={item} className={game === item ? 'selected' : ''} onClick={() => setGame(item)}>{item}</button>)}
          <span className="divider" />
          <button>Land⌄</button><button>Sprache⌄</button><button>Bewerbungen offen</button><button>Weitere Filter <span className="filter-count">3</span></button>
        </div>
        <div className="company-grid">
          {filtered.map((company, index) => (
            <article className={`company-card ${company.color}`} key={company.tag}>
              <div className="card-cover"><span className="cover-code">{String(index+1).padStart(2,'0')} / VTC</span><button className={favorites.includes(company.tag) ? 'favorite on' : 'favorite'} onClick={() => setFavorites((items) => items.includes(company.tag) ? items.filter(x => x !== company.tag) : [...items, company.tag])} aria-label="Favorit umschalten">♥</button></div>
              <div className="card-body"><div className="logo">{company.tag}</div><div className="company-title"><h3>{company.name} {company.verified && <span className="verified">✓</span>}</h3><span>{company.tag} · {company.country}</span></div>
                <div className="badges"><span>{company.game}</span><span className={company.open ? 'open' : 'closed'}>{company.open ? 'Bewerbungen offen' : 'Geschlossen'}</span></div>
                <p>Gemeinsam unterwegs. Faire Disposition, regelmäßige Events und eine starke Community für alle, die mehr aus ihrer Tour machen wollen.</p>
                <div className="card-stats"><div><strong>{company.drivers}</strong><span>Fahrer</span></div><div><strong>{company.km}</strong><span>Kilometer</span></div><div><span className="status-dot" /> <small>{company.status}</small></div></div>
                <a className="profile-button" href="/vtc/nordlicht-logistik">Profil ansehen <span>→</span></a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="live-strip" id="live"><div><span className="live-dot" /> LIVE AUF DER STRASSE</div><strong>327 Fahrer sind gerade unterwegs</strong><a href="/live-map">Live-Map öffnen →</a></section>
    </main>
  );
}

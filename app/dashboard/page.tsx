"use client";

import { useState } from "react";
import DashboardReal from "../DashboardReal";

const menu = [
  "Übersicht",
  "Fahrer",
  "Bewerbungen",
  "Disposition",
  "Fahrtenbuch",
  "Live-Map",
  "Fuhrpark",
  "Lohnbüro",
  "Events",
  "Statistik",
];
const trips = [
  ["MiaOnRoad", "Hamburg → Bergen", "1.242 km", "Freigegeben"],
  ["SvenCargo", "Berlin → Paris", "1.097 km", "Zur Prüfung"],
  ["MikaDrive", "Kiel → Zürich", "1.184 km", "Unterwegs"],
];

export default function Dashboard() {return <DashboardReal/>}
function LegacyDashboard() {
  const [active, setActive] = useState("Übersicht");
  return (
    <main className="dash-shell">
      <aside className="dash-side">
        <a className="brand" href="/">
          <span className="brand-mark">CH</span>
          <span>
            CONVOY<span>HUB</span>
          </span>
        </a>
        <div className="company-switch">
          <span>NGL</span>
          <div>
            <strong>Nordlicht Logistik</strong>
            <small>Unternehmensbereich</small>
          </div>
          <b>⌄</b>
        </div>
        <nav>
          {menu.map((item, i) => (
            <button
              key={item}
              className={active === item ? "active" : ""}
              onClick={() =>
                item === "Lohnbüro"
                  ? (location.href = "/finanzen")
                  : item === "Fahrer"
                    ? (location.href = "/verwaltung")
                    : item === "Bewerbungen"
                      ? (location.href = "/bewerbungen")
                      : item === "Disposition"
                        ? (location.href = "/disposition")
                        : item === "Fahrtenbuch"
                          ? (location.href = "/fahrtenbuch")
                          : item === "Fuhrpark"
                            ? (location.href = "/fuhrpark")
                            : item === "Statistik"
                              ? (location.href = "/statistik")
                              : item === "Events"
                                ? (location.href = "/events")
                                : setActive(item)
              }
            >
              <span>
                {["⌂", "♟", "✦", "▣", "≣", "◎", "▱", "€", "◇", "↗"][i]}
              </span>
              {item}
              {item === "Bewerbungen" && <b>6</b>}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <a href="/community">☷ News, Pinnwand & Nachrichten</a>
          <a href="/kalender">◇ Kalender & Urlaub</a>
          <a href="/wiki">▤ Wiki & Schulungen</a>
          <a href="/downloads">⇩ Downloads & Mods</a>
          <a href="/benachrichtigungen">● Benachrichtigungen</a>
          <a href="/integrationen">↔ TruckersMP, API & Webhooks</a>
          <a href="/verwaltung">⚙ Einstellungen & Rechte</a>
          <a href="/support">◫ Hilfe & Support</a>
          <a href="/">← Öffentliche Seite</a>
        </div>
      </aside>
      <section className="dash-main">
        <header>
          <div>
            <span className="kicker">DONNERSTAG, 20. AUGUST</span>
            <h1>{active}</h1>
          </div>
          <div className="user">
            <button aria-label="Benachrichtigungen">●</button>
            <span>LN</span>
            <div>
              <strong>Lars_NGL</strong>
              <small>Geschäftsführer</small>
            </div>
          </div>
        </header>
        {active === "Übersicht" ? (
          <>
            <div className="welcome">
              <div>
                <span className="kicker">GUTEN MORGEN, LARS</span>
                <h2>Die Crew ist auf Kurs.</h2>
                <p>
                  18 Fahrer sind gerade unterwegs. 6 neue Bewerbungen warten auf
                  deine Prüfung.
                </p>
              </div>
              <button>+ Neue Ankündigung</button>
            </div>
            <div className="metric-grid">
              <article>
                <span>FAHRER GESAMT</span>
                <strong>148</strong>
                <small>
                  <i>+4</i> diesen Monat
                </small>
              </article>
              <article>
                <span>JETZT UNTERWEGS</span>
                <strong>18</strong>
                <small>
                  <i className="pulse" /> 26 Fahrer online
                </small>
              </article>
              <article>
                <span>MONATSKILOMETER</span>
                <strong>842.306</strong>
                <small>
                  <i>+12,8%</i> zum Vormonat
                </small>
              </article>
              <article>
                <span>OFFENE BEWERBUNGEN</span>
                <strong>6</strong>
                <small>3 noch unbearbeitet</small>
              </article>
            </div>
            <div className="dash-grid">
              <section className="dash-panel wide">
                <div className="panel-head">
                  <div>
                    <span className="kicker">AKTIVITÄT</span>
                    <h3>Kilometer im August</h3>
                  </div>
                  <select aria-label="Zeitraum">
                    <option>Letzte 14 Tage</option>
                  </select>
                </div>
                <div className="chart">
                  <div className="chart-labels">
                    <span>80k</span>
                    <span>60k</span>
                    <span>40k</span>
                    <span>20k</span>
                    <span>0</span>
                  </div>
                  <div className="bars">
                    {[
                      42, 55, 38, 72, 64, 81, 49, 58, 77, 69, 88, 73, 91, 84,
                    ].map((v, i) => (
                      <div key={i}>
                        <i style={{ height: `${v}%` }} />
                        <span>{i + 7}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              <section className="dash-panel">
                <div className="panel-head">
                  <div>
                    <span className="kicker">HEUTE</span>
                    <h3>Crew-Status</h3>
                  </div>
                </div>
                <div className="crew-ring">
                  <div>
                    <strong>26</strong>
                    <span>online</span>
                  </div>
                </div>
                <ul className="legend">
                  <li>
                    <i className="teal" />
                    Unterwegs <b>18</b>
                  </li>
                  <li>
                    <i className="blue" />
                    Im Dashboard <b>8</b>
                  </li>
                  <li>
                    <i className="gray" />
                    Offline <b>122</b>
                  </li>
                </ul>
              </section>
              <section className="dash-panel wide">
                <div className="panel-head">
                  <div>
                    <span className="kicker">FAHRTENBUCH</span>
                    <h3>Letzte Fahrten</h3>
                  </div>
                  <button>Alle Fahrten →</button>
                </div>
                <div className="trip-table">
                  {trips.map((t) => (
                    <div key={t[0]}>
                      <span className="mini-avatar">
                        {t[0].slice(0, 2).toUpperCase()}
                      </span>
                      <strong>{t[0]}</strong>
                      <span>{t[1]}</span>
                      <span>{t[2]}</span>
                      <em className={t[3].replace(" ", "").toLowerCase()}>
                        {t[3]}
                      </em>
                    </div>
                  ))}
                </div>
              </section>
              <section className="dash-panel">
                <div className="panel-head">
                  <div>
                    <span className="kicker">NÄCHSTES EVENT</span>
                    <h3>Sommerkonvoi 2026</h3>
                  </div>
                </div>
                <div className="next-event">
                  <div>
                    <strong>24</strong>
                    <span>AUG</span>
                  </div>
                  <p>
                    Hamburg → Bergen
                    <br />
                    <small>20:00 Uhr · TruckersMP</small>
                  </p>
                </div>
                <div className="event-progress">
                  <span>
                    <b>84</b> / 120 Teilnehmer
                  </span>
                  <i>
                    <b />
                  </i>
                </div>
                <button className="dark-button">Event verwalten →</button>
              </section>
            </div>
          </>
        ) : (
          <section className="module-placeholder">
            <span className="kicker">MODUL</span>
            <h2>{active}</h2>
            <p>
              Hier werden alle Daten und Werkzeuge für den Bereich{" "}
              <strong>{active}</strong> zentral verwaltet.
            </p>
            <div className="placeholder-cards">
              <article>
                Aktive Einträge<strong>{active === "Fahrer" ? 148 : 24}</strong>
              </article>
              <article>
                Heute neu<strong>{active === "Bewerbungen" ? 6 : 3}</strong>
              </article>
              <article>
                Offene Aufgaben<strong>8</strong>
              </article>
            </div>
            <button className="primary" onClick={() => setActive("Übersicht")}>
              Zurück zur Übersicht
            </button>
          </section>
        )}
      </section>
    </main>
  );
}

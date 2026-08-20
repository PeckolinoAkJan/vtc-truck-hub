"use client";
import { useEffect, useState } from "react";
type Driver = {
  userId: string;
  driverName?: string;
  vtcId: string;
  vtcName?: string;
  game: string;
  latitude: number;
  longitude: number;
  heading: number;
  speedKph: number;
  truck?: string;
  cargo?: string;
  sourceCity?: string;
  destinationCity?: string;
  recordedAt: string;
};
export default function LiveMap() {
  const [drivers, setDrivers] = useState<Driver[]>([]),
    [selected, setSelected] = useState<Driver | null>(null),
    [game, setGame] = useState("Alle");
  async function load() {
    const d = await fetch("/api/v1/live").then((r) => r.json());
    setDrivers(d.data);
    setSelected((s) => s ?? d.data[0]);
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);
  const visible = drivers.filter((d) => game === "Alle" || d.game === game);
  return (
    <main className="map-page">
      <header className="nav compact">
        <a className="brand" href="/">
          <span className="brand-mark">VH</span>
          <span>
            VTC TRUCK <span>HUB</span>
          </span>
        </a>
        <nav>
          <a href="/">Speditionen</a>
          <a className="active" href="/live-map">
            Live-Map
          </a>
          <a href="/dashboard">Dashboard</a>
        </nav>
        <div className="nav-actions">
          <a className="login" href="/konto">
            Konto
          </a>
        </div>
      </header>
      <section className="map-toolbar">
        <div>
          <span className="live-dot" />
          <b>LIVE-MAP</b>
          <small>Öffentlich 10 Minuten verzögert und gerundet</small>
        </div>
        <div className="map-filters">
          {["Alle", "ETS2", "ATS"].map((x) => (
            <button
              className={game === x ? "active" : ""}
              key={x}
              onClick={() => setGame(x)}
            >
              {x}
            </button>
          ))}
        </div>
      </section>
      <div className="map-layout">
        <section className="world-map">
          <div className="grid-lines" />
          <div className="land europe" />
          <div className="land america" />
          {visible.map((d, i) => {
            const left =
              d.game === "ATS"
                ? 18 + ((d.longitude + 125) / 60) * 25
                : 52 + ((d.longitude + 10) / 45) * 34;
            const top =
              d.game === "ATS"
                ? 55 - ((d.latitude - 25) / 25) * 28
                : 52 - ((d.latitude - 35) / 35) * 33;
            return (
              <button
                key={`${d.userId}${i}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  transform: `rotate(${d.heading}deg)`,
                }}
                className={
                  selected?.userId === d.userId
                    ? "truck-marker selected"
                    : "truck-marker"
                }
                onClick={() => setSelected(d)}
                aria-label={d.userId}
              >
                <i>▲</i>
                <span>{d.userId}</span>
              </button>
            );
          })}
          <div className="map-legend">
            <span>
              <i /> ETS2 / ATS Fahrer
            </span>
            <b>{visible.length} sichtbar</b>
          </div>
        </section>
        <aside className="driver-panel">
          {selected ? (
            <>
              <span className="kicker">FAHRER LIVE</span>
              <div className="driver-id">
                <span>{(selected.driverName??selected.userId).slice(0, 2).toUpperCase()}</span>
                <div>
                  <h2>{selected.driverName??selected.userId}</h2>
                  <p>{selected.vtcName??"Keine öffentliche Speditionsangabe"}</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Spiel</dt>
                  <dd>{selected.game}</dd>
                </div>
                <div>
                  <dt>Geschwindigkeit</dt>
                  <dd>{selected.speedKph} km/h</dd>
                </div>
                <div>
                  <dt>LKW</dt>
                  <dd>{selected.truck ?? "Privat"}</dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd>
                    {selected.sourceCity} → {selected.destinationCity}
                  </dd>
                </div>
                <div>
                  <dt>Letztes Signal</dt>
                  <dd>
                    {new Date(selected.recordedAt).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </dd>
                </div>
              </dl>
              <button>Fahrerprofil ansehen →</button>
            </>
          ) : (
            <p>Kein Fahrer ausgewählt.</p>
          )}
        </aside>
      </div>
    </main>
  );
}

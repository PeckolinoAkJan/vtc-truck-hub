"use client";

import { useEffect, useMemo, useState } from "react";
import PublicNav from "../components/PublicNav";

type Driver = {
  userId: string;
  driverName?: string;
  vtcId: string;
  vtcName?: string;
  tripId?: string;
  game: string;
  latitude: number;
  longitude: number;
  gameX?: number;
  gameY?: number;
  gameZ?: number;
  coordinateAccuracy?: string;
  projectionProfile?: string;
  heading: number;
  speedKph: number;
  truck?: string;
  cargo?: string;
  sourceCity?: string;
  destinationCity?: string;
  server?: string;
  recordedAt: string;
  ageSeconds?: number;
  connectionStatus?: "live" | "delayed" | "offline";
};

type TrailPoint = { latitude: number; longitude: number; recordedAt: string };
type LiveResponse = {
  data: Driver[];
  trails?: Record<string, TrailPoint[]>;
  meta?: {
    privacy?: string;
    delayMinutes?: number;
    pollIntervalMs?: number;
  };
};
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function mapPoint(game: string, latitude: number, longitude: number) {
  if (game === "ATS") {
    return {
      left: clamp(5 + ((longitude + 175) / 123) * 40, 3, 47),
      top: clamp(76 - ((latitude - 18) / 54) * 62, 8, 80),
    };
  }
  return {
    left: clamp(51 + ((longitude + 30) / 95) * 45, 49, 97),
    top: clamp(76 - ((latitude - 28) / 44) * 64, 7, 82),
  };
}

function trailPath(driver: Driver | null, trails: Record<string, TrailPoint[]>) {
  if (!driver) return "";
  return (trails[driver.userId] ?? [])
    .map((point, index) => {
      const mapped = mapPoint(driver.game, point.latitude, point.longitude);
      return `${index ? "L" : "M"}${mapped.left} ${mapped.top}`;
    })
    .join(" ");
}

function relativeSignal(driver: Driver) {
  const seconds = driver.ageSeconds ?? Math.max(0, Math.round((Date.now() - Date.parse(driver.recordedAt)) / 1000));
  if (seconds < 5) return "gerade eben";
  if (seconds < 60) return `vor ${seconds} Sekunden`;
  return `vor ${Math.max(1, Math.round(seconds / 60))} Minuten`;
}

export default function LiveMap() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trails, setTrails] = useState<Record<string, TrailPoint[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [game, setGame] = useState("Alle");
  const [vtc, setVtc] = useState("Alle");
  const [search, setSearch] = useState("");
  const [following, setFollowing] = useState(false);
  const [meta, setMeta] = useState<LiveResponse["meta"]>();
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      let interval = 15000;
      try {
        const response = await fetch("/api/v1/live", { cache: "no-store" });
        if (!response.ok) throw new Error("Live-Daten konnten nicht geladen werden.");
        const payload = (await response.json()) as LiveResponse;
        if (stopped) return;
        const nextDrivers = Array.isArray(payload.data) ? payload.data : [];
        setDrivers(nextDrivers);
        setTrails(payload.trails ?? {});
        setMeta(payload.meta);
        setError("");
        setSelectedId((current) =>
          current && nextDrivers.some((driver) => driver.userId === current)
            ? current
            : nextDrivers[0]?.userId ?? null,
        );
        interval = clamp(payload.meta?.pollIntervalMs ?? 15000, 3000, 30000);
      } catch (reason) {
        if (!stopped) setError(reason instanceof Error ? reason.message : "Live-Verbindung unterbrochen.");
      } finally {
        if (!stopped) timer = setTimeout(load, interval);
      }
    }
    void load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const vtcOptions = useMemo(
    () => [...new Map(drivers.filter((driver) => driver.vtcId).map((driver) => [driver.vtcId, driver.vtcName ?? driver.vtcId])).entries()],
    [drivers],
  );
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de-DE");
    return drivers.filter((driver) =>
      (game === "Alle" || driver.game === game) &&
      (vtc === "Alle" || driver.vtcId === vtc) &&
      (!query || [driver.driverName, driver.userId, driver.truck, driver.cargo, driver.sourceCity, driver.destinationCity]
        .some((value) => value?.toLocaleLowerCase("de-DE").includes(query))),
    );
  }, [drivers, game, search, vtc]);
  const selected = drivers.find((driver) => driver.userId === selectedId) ?? null;
  const selectedTrail = trailPath(selected, trails);
  const isInternal = meta?.privacy === "internal-exact";
  const markerGroups = useMemo(() => {
    const groups = new Map<string, { drivers: Driver[]; left: number; top: number }>();
    for (const driver of visible) {
      const point = mapPoint(driver.game, Number(driver.latitude), Number(driver.longitude));
      const key = `${driver.game}:${Math.round(point.left / 3)}:${Math.round(point.top / 4)}`;
      const group = groups.get(key);
      if (group) group.drivers.push(driver);
      else groups.set(key, { drivers: [driver], ...point });
    }
    return [...groups.values()];
  }, [visible]);

  return (
    <main className="map-page">
      <PublicNav active="live" />

      <section className="map-toolbar">
        <div>
          <span className="live-dot" />
          <b>{isInternal ? "SPEDITIONS-LIVE-MAP" : "LIVE-MAP"}</b>
          <small>{isInternal ? "Echtzeitansicht deiner Spedition" : "Öffentlich 10 Minuten verzögert und gerundet"}</small>
        </div>
        <div className="map-filters">
          <input
            aria-label="Fahrer suchen"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Fahrer suchen"
            value={search}
          />
          {vtcOptions.length > 1 && <select aria-label="Spedition filtern" onChange={(event) => setVtc(event.target.value)} value={vtc}>
            <option value="Alle">Alle Speditionen</option>
            {vtcOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>}
          {['Alle', 'ETS2', 'ATS'].map((value) => (
            <button className={game === value ? "active" : ""} key={value} onClick={() => setGame(value)}>{value}</button>
          ))}
        </div>
      </section>

      <div className="map-layout">
        <section className="world-map" aria-label="Live-Positionen von ETS2- und ATS-Fahrern">
          <div className="grid-lines" />
          <div className="land europe" />
          <div className="land america" />
          {selectedTrail && <svg className="driver-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={selectedTrail} />
          </svg>}
          {markerGroups.map((group) => {
            if (group.drivers.length > 1) return <button
              className="truck-cluster"
              key={group.drivers.map((driver) => driver.userId).join(":")}
              onClick={() => setSelectedId(group.drivers[0].userId)}
              style={{ left: `${group.left}%`, top: `${group.top}%` }}
              aria-label={`${group.drivers.length} Fahrer in diesem Kartenbereich`}
            >{group.drivers.length}<small>Fahrer</small></button>;
            const driver = group.drivers[0];
            const status = driver.connectionStatus ?? "delayed";
            return (
              <button
                key={driver.userId}
                style={{ left: `${group.left}%`, top: `${group.top}%` }}
                className={`truck-marker ${selectedId === driver.userId ? "selected" : ""} ${following && selectedId === driver.userId ? "following" : ""} status-${status}`}
                onClick={() => setSelectedId(driver.userId)}
                aria-label={`${driver.driverName ?? driver.userId}, ${driver.speedKph.toFixed(0)} km/h`}
              >
                <i style={{ transform: `rotate(${Number(driver.heading) || 0}deg)` }}>▲</i>
                <span>{driver.driverName ?? driver.userId}</span>
              </button>
            );
          })}
          {!visible.length && <div className="map-empty">
            <b>{error ? "LIVE-VERBINDUNG UNTERBROCHEN" : "KEINE AKTIVEN FAHRER"}</b>
            <span>{error || "Sobald der angemeldete Client Telemetrie sendet, erscheint der Fahrer automatisch hier."}</span>
          </div>}
          <div className="map-legend">
            <span><i /> ETS2 / ATS Fahrer</span>
            <b>{visible.length} sichtbar</b>
            <span>{isInternal ? "Echtzeit" : `${meta?.delayMinutes ?? 10} Min. verzögert`}</span>
          </div>
        </section>

        <aside className="driver-panel">
          {selected ? <>
            <span className="kicker">FAHRER {selected.connectionStatus === "live" ? "LIVE" : "SIGNAL"}</span>
            <div className="driver-id">
              <span>{(selected.driverName ?? selected.userId).slice(0, 2).toUpperCase()}</span>
              <div>
                <h2>{selected.driverName ?? selected.userId}</h2>
                <p>{selected.vtcName ?? "Keine öffentliche Speditionsangabe"}</p>
              </div>
            </div>
            <dl>
              <div><dt>Status</dt><dd className={`signal-${selected.connectionStatus ?? "delayed"}`}>{selected.connectionStatus === "live" ? "LIVE VERBUNDEN" : selected.connectionStatus === "offline" ? "OFFLINE" : "VERZÖGERT"}</dd></div>
              <div><dt>Spiel</dt><dd>{selected.game}</dd></div>
              <div><dt>Geschwindigkeit</dt><dd>{Number(selected.speedKph).toFixed(0)} km/h</dd></div>
              <div><dt>LKW</dt><dd>{selected.truck ?? "Privat"}</dd></div>
              <div><dt>Fracht</dt><dd>{selected.cargo ?? "Keine öffentliche Angabe"}</dd></div>
              <div><dt>Route</dt><dd>{selected.sourceCity ?? "—"} → {selected.destinationCity ?? "—"}</dd></div>
              {selected.server && <div><dt>Server</dt><dd>{selected.server}</dd></div>}
              <div><dt>Letztes Signal</dt><dd>{relativeSignal(selected)}</dd></div>
              {isInternal && <div><dt>GPS-Profil</dt><dd>{selected.projectionProfile ?? selected.coordinateAccuracy ?? "Unbekannt"}</dd></div>}
            </dl>
            {isInternal && <button onClick={() => setFollowing((value) => !value)}>{following ? "Verfolgung beenden" : "Fahrer verfolgen"} →</button>}
          </> : <p>Kein Fahrer ausgewählt.</p>}

          {visible.length > 1 && <section className="map-driver-list">
            <span className="kicker">AKTIVE FAHRER</span>
            {visible.slice(0, 20).map((driver) => <button key={driver.userId} onClick={() => setSelectedId(driver.userId)}>
              <span className={`driver-status status-${driver.connectionStatus ?? "delayed"}`} />
              <b>{driver.driverName ?? driver.userId}</b>
              <small>{Number(driver.speedKph).toFixed(0)} km/h · {driver.game}</small>
            </button>)}
          </section>}
        </aside>
      </div>
    </main>
  );
}

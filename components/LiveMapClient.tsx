"use client";

// Dieses Leaflet-Modul wird ausschließlich nach dem Browser-Mount durch
// app/live-map/page.tsx geladen. Es darf nicht statisch vom Server importiert werden.
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import L, { type LatLngTuple } from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

type LivePosition = {
  userId: string;
  driverName?: string;
  name?: string;
  vtcId?: string;
  vtcName?: string | null;
  game?: string;
  gameX?: number | null;
  gameZ?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  heading?: number | null;
  speedKph?: number | null;
  connectionStatus?: "live" | "delayed" | "offline";
  recordedAt?: string;
};

type LiveResponse = {
  data?: LivePosition[];
  meta?: {
    privacy?: string;
    delayMinutes?: number;
  };
};

type PositionedTruck = {
  position: LivePosition;
  point: LatLngTuple;
};

const POLLING_INTERVAL_MS = 3000;
const LIVE_MAP_CRS = L.CRS.Simple;
// Die SVG-Lkw zeigen in ihrer Ausgangslage nach oben. Das entspricht dem
// SCS-Heading 0°; positive SCS-Werte und CSS-Rotationen laufen im Uhrzeigersinn.
const TRUCK_HEADING_OFFSET_DEGREES = 0;

// Affine ETS2-Kalibrierung im linearen L.CRS.Simple-Koordinatenraum aus
// Berlin, Paris und Aberdeen. Game_X mappt auf Leaflet-Lng, Game_Z auf
// Leaflet-Lat. Die kleinen Querkoeffizienten gleichen die in den drei
// Referenzpunkten messbare Rotation/Scherung des Tile-Exports aus.
//
// Referenzkontrolle:
// Berlin   ( 10397.3,  -9112.53) -> [-103.2841796875,  154.59375]
// Paris    (-31951.0,   4863.97) -> [-125.23291015625,  92.26123046875]
// Aberdeen (-38961.3, -54849.50) -> [ -37.388671875,   81.9365234375]
const ETS2_MAP_CALIBRATION = {
  latFromX: 0.00003155232523285867,
  latFromZ: -0.0014748000668329926,
  latOffset: -117.05139853166125,
  lngFromX: 0.001471934526812507,
  lngFromZ: 0.0000001005538270726922,
  lngOffset: 139.29052144413814,
} as const;

const gameToMap = (gameX: number, gameZ: number): [number, number] => [
  ETS2_MAP_CALIBRATION.latFromX * gameX
    + ETS2_MAP_CALIBRATION.latFromZ * gameZ
    + ETS2_MAP_CALIBRATION.latOffset,
  ETS2_MAP_CALIBRATION.lngFromX * gameX
    + ETS2_MAP_CALIBRATION.lngFromZ * gameZ
    + ETS2_MAP_CALIBRATION.lngOffset,
];

// ATS bleibt bis zu einer eigenen Kalibrierung bei der bisherigen Rohabbildung.
const scsToLeaflet = (x: number, z: number): LatLngTuple => [
  -(z / 1),
  x / 1,
];

const finiteNumber = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? null : Number(value);

const positionToLeaflet = (position: LivePosition): LatLngTuple | null => {
  const x = finiteNumber(position.gameX);
  const z = finiteNumber(position.gameZ);
  if (x !== null && z !== null) {
    return position.game?.trim().toLowerCase() === "ats"
      ? scsToLeaflet(x, z)
      : gameToMap(x, z);
  }

  // Öffentliche Antworten enthalten absichtlich nur verzögerte und gerundete
  // Koordinaten. Sie bleiben im selben einfachen Leaflet-Koordinatenraum.
  const latitude = finiteNumber(position.latitude);
  const longitude = finiteNumber(position.longitude);
  return latitude !== null && longitude !== null
    ? [latitude, longitude]
    : null;
};

const normalizedHeading = (value: number | null | undefined) => {
  const heading = finiteNumber(value) ?? 0;
  return (
    ((heading + TRUCK_HEADING_OFFSET_DEGREES) % 360 + 360) % 360
  );
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);

const ETS2_TRUCK_SVG = `
  <svg class="truck-svg truck-svg--ets2" viewBox="0 0 48 64" xmlns="http://www.w3.org/2000/svg" focusable="false">
    <rect x="20" y="23" width="8" height="36" rx="3" fill="#18313c"/>
    <rect x="8" y="39" width="7" height="14" rx="3" fill="#071219"/>
    <rect x="33" y="39" width="7" height="14" rx="3" fill="#071219"/>
    <rect x="6" y="6" width="36" height="32" rx="9" fill="#19c6d3" stroke="#e8ffff" stroke-width="2"/>
    <path d="M10 19h28v12c-8 4-20 4-28 0V19Z" fill="#0e91a3"/>
    <path d="M12 10h24l2 8H10l2-8Z" fill="#123645" stroke="#82f4f5" stroke-width="1.5"/>
    <path d="M24 10v8M13 27h22" stroke="#d9ffff" stroke-width="1.5" opacity=".8"/>
    <rect x="2" y="12" width="5" height="8" rx="2" fill="#d7f5f5"/>
    <rect x="41" y="12" width="5" height="8" rx="2" fill="#d7f5f5"/>
    <rect x="11" y="5" width="8" height="3" rx="1.5" fill="#fff7bd"/>
    <rect x="29" y="5" width="8" height="3" rx="1.5" fill="#fff7bd"/>
    <path d="M15 38v19M33 38v19" stroke="#7c98a3" stroke-width="3" stroke-linecap="round"/>
    <rect x="17" y="55" width="14" height="6" rx="3" fill="#a9c2c9"/>
  </svg>`;

const ATS_TRUCK_SVG = `
  <svg class="truck-svg truck-svg--ats" viewBox="0 0 48 64" xmlns="http://www.w3.org/2000/svg" focusable="false">
    <rect x="20" y="31" width="8" height="29" rx="3" fill="#392820"/>
    <rect x="7" y="42" width="8" height="14" rx="3" fill="#100c0a"/>
    <rect x="33" y="42" width="8" height="14" rx="3" fill="#100c0a"/>
    <rect x="10" y="25" width="28" height="27" rx="7" fill="#dc4d2f" stroke="#fff0d5" stroke-width="2"/>
    <path d="M14 27h20l2 8H12l2-8Z" fill="#332c2b" stroke="#ffc86a" stroke-width="1.5"/>
    <rect x="15" y="5" width="18" height="25" rx="8" fill="#ef6a35" stroke="#fff0d5" stroke-width="2"/>
    <path d="M18 7h12v12H18z" fill="#d44827"/>
    <path d="M19 10h10M19 14h10M19 18h10" stroke="#ffe2b4" stroke-width="1.5"/>
    <rect x="17" y="3" width="5" height="4" rx="2" fill="#fff3ad"/>
    <rect x="26" y="3" width="5" height="4" rx="2" fill="#fff3ad"/>
    <path d="M9 29V16M39 29V16" stroke="#d9e2e4" stroke-width="3" stroke-linecap="round"/>
    <circle cx="9" cy="15" r="2" fill="#f8ffff"/>
    <circle cx="39" cy="15" r="2" fill="#f8ffff"/>
    <path d="M13 42h22M16 51v8M32 51v8" stroke="#ffbb62" stroke-width="2" opacity=".8"/>
    <rect x="17" y="56" width="14" height="6" rx="3" fill="#c5d0d2"/>
  </svg>`;

const truckIcon = (
  game: string | undefined,
  heading: number | null | undefined,
  label: string,
) => {
  const simulator = game?.trim().toLowerCase() === "ats" ? "ats" : "ets2";
  const svg = simulator === "ats" ? ATS_TRUCK_SVG : ETS2_TRUCK_SVG;
  const rotation = normalizedHeading(heading);

  return L.divIcon({
    className: `truck-marker-container truck-marker-container--${simulator}`,
    html: `<div class="truck-marker-content"><div class="truck-icon truck-icon--${simulator}" data-heading="${rotation}" aria-hidden="true" style="transform: rotate(${rotation}deg) !important; transform-origin: center center !important;">${svg}</div><span class="truck-label">${escapeHtml(label)}</span></div>`,
    iconSize: [104, 72],
    iconAnchor: [52, 25],
    popupAnchor: [0, -30],
  });
};

function InitialViewport({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || points.length === 0) return;
    fitted.current = true;

    if (points.length === 1) {
      map.setView(points[0], 0, { animate: false });
      return;
    }

    map.fitBounds(L.latLngBounds(points), {
      animate: false,
      maxZoom: 1,
      padding: [48, 48],
    });
  }, [map, points]);

  return null;
}

export default function LiveMapClient() {
  const [activeGame, setActiveGame] = useState<"ets2" | "ats">("ets2");
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [meta, setMeta] = useState<LiveResponse["meta"]>();
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;

    const loadPositions = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const response = await fetch("/api/v1/live", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Live-Daten konnten nicht geladen werden (${response.status}).`);
        }

        const payload = (await response.json()) as LiveResponse;
        setPositions(Array.isArray(payload.data) ? payload.data : []);
        setMeta(payload.meta);
        setLastUpdatedAt(new Date());
        setError("");
      } catch (reason) {
        if (!controller.signal.aborted) {
          setPositions([]);
          setError(
            reason instanceof Error
              ? reason.message
              : "Die Live-Daten sind vorübergehend nicht erreichbar.",
          );
        }
      } finally {
        inFlight = false;
      }
    };

    void loadPositions();
    const pollingTimer = window.setInterval(
      () => void loadPositions(),
      POLLING_INTERVAL_MS,
    );

    return () => {
      controller.abort();
      window.clearInterval(pollingTimer);
    };
  }, []);

  const trucks = useMemo<PositionedTruck[]>(
    () =>
      positions
        .filter((position) => {
          const telemetryGame = position.game?.trim().toLowerCase();
          return !telemetryGame || telemetryGame === activeGame;
        })
        .flatMap((position) => {
          const point = positionToLeaflet(position);
          return point ? [{ position, point }] : [];
        }),
    [activeGame, positions],
  );

  const isInternal = meta?.privacy === "internal-exact";

  return (
    <section className="leaflet-live-map" aria-label="Live-Positionen der Fahrer">
      <MapContainer
        attributionControl={false}
        center={[0, 0]}
        className="leaflet-live-map__canvas"
        crs={LIVE_MAP_CRS}
        maxZoom={14}
        minZoom={-8}
        scrollWheelZoom
        style={{ height: "100vh", minHeight: "500px", width: "100%" }}
        zoom={0}
      >
        <TileLayer
          key={activeGame}
          maxNativeZoom={7}
          maxZoom={14}
          noWrap
          tileSize={256}
          url={`https://livemap.vtc-truck-hub.de/${activeGame}/{z}/{x}/{y}.png`}
        />
        <InitialViewport
          key={activeGame}
          points={trucks.map((truck) => truck.point)}
        />

        {trucks.map(({ position, point }) => {
          const name =
            position.name || position.driverName || position.userId || "Anonymer Fahrer";
          const speed = finiteNumber(position.speedKph);

          return (
            <Marker
              icon={truckIcon(position.game, position.heading, name)}
              key={`${position.vtcId ?? "public"}:${position.userId}`}
              position={point}
              title={name}
              zIndexOffset={1000}
            >
              <Popup>
                <article className="truck-popup">
                  <strong>{name}</strong>
                  <span>{position.vtcName ?? position.vtcId ?? "Öffentliche Ansicht"}</span>
                  <dl>
                    <div><dt>Spiel</dt><dd>{position.game ?? "—"}</dd></div>
                    <div><dt>Geschwindigkeit</dt><dd>{speed === null ? "—" : `${Math.round(speed)} km/h`}</dd></div>
                    <div><dt>Status</dt><dd>{position.connectionStatus === "live" ? "Live" : "Verzögert"}</dd></div>
                  </dl>
                </article>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div
        aria-label="Spiel auswählen"
        className="absolute right-5 top-20 z-[1000] flex gap-1 border border-slate-600 bg-slate-950/90 p-1 shadow-xl backdrop-blur"
        role="group"
      >
        {(["ets2", "ats"] as const).map((game) => (
          <button
            aria-pressed={activeGame === game}
            className={`px-4 py-2 text-[10px] font-black tracking-wider transition-colors ${
              activeGame === game
                ? "bg-cyan-400 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
            key={game}
            onClick={() => setActiveGame(game)}
            type="button"
          >
            {game.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="leaflet-live-map__status" role="status">
        <span className={error ? "is-error" : "is-connected"} />
        <div>
          <strong>{error ? "Verbindung unterbrochen" : `${trucks.length} Fahrer sichtbar`}</strong>
          <small>
            {error ||
              (isInternal
                ? "Exakte Daten deiner Spedition · Aktualisierung alle 3 Sekunden"
                : "Near-Real-Time · Namen anonymisiert · Aktualisierung alle 3 Sekunden")}
          </small>
        </div>
        {lastUpdatedAt && !error && (
          <time dateTime={lastUpdatedAt.toISOString()}>
            {lastUpdatedAt.toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </time>
        )}
      </div>

      {!error && trucks.length === 0 && (
        <div className="leaflet-live-map__empty">
          <strong>KEINE AKTIVEN FAHRER</strong>
          <span>Sobald Telemetrie verfügbar ist, erscheinen die Fahrzeuge automatisch.</span>
        </div>
      )}
    </section>
  );
}

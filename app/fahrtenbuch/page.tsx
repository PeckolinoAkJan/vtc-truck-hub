"use client";
import { FormEvent, useEffect, useState } from "react";
import TripsExperience from "./TripsExperience";
import "./tripbook.css";
type Trip = {
  id: string;
  driver: string;
  game: string;
  mode: string;
  sourceCity: string;
  destinationCity: string;
  cargo: string;
  distanceKm: number;
  fuelLiters: number;
  damage: number;
  income: number;
  status: string;
  startedAt: string;
  completedAt?: string;
  telemetrySource: string;
  reviewStatus?: string;
  reviewReason?: string;
};
type Data = {
  canReview: boolean;
  trips: Trip[];
  comments: Array<{
    id: string;
    tripId: string;
    body: string;
    internal: number;
    author: string;
    createdAt: string;
  }>;
  edits: Array<{
    tripId: string;
    field: string;
    oldValue: string;
    newValue: string;
    actor: string;
    createdAt: string;
  }>;
  evidence: unknown[];
};
export default function Trips(){return <TripsExperience/>}
function LegacyTrips() {
  const [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState<Trip | null>(null),
    [mine, setMine] = useState(true),
    [message, setMessage] = useState("");
  async function load() {
    const r = await fetch(`/api/v1/trips?vtcId=vtc-ngl&mine=${mine ? 1 : 0}`);
    if (r.status === 401) {
      location.href = "/konto";
      return;
    }
    setData(await r.json());
  }
  useEffect(() => {
    load();
  }, [mine]);
  async function act(body: unknown) {
    const r = await fetch("/api/v1/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vtcId: "vtc-ngl", ...(body as object) }),
      }),
      j = await r.json();
    setMessage(r.ok ? "Fahrtenbuch aktualisiert." : j.error);
    if (r.ok) await load();
  }
  if (!data)
    return <main className="tripbook-loading">Fahrtenbuch wird geladen …</main>;
  return (
    <main className="tripbook-page">
      <header>
        <a className="brand" href="/">
          <span className="brand-mark">CH</span>
          <span>
            CONVOY<span>HUB</span>
          </span>
        </a>
        <div>
          <span className="kicker">NGL · FAHRTENBUCH</span>
          <h1>Fahrten und Prüfung</h1>
        </div>
        <a href="/dashboard">Dashboard</a>
      </header>
      <div className="tripbook-tools">
        <button className={mine ? "active" : ""} onClick={() => setMine(true)}>
          Meine Fahrten
        </button>
        {data.canReview && (
          <button
            className={!mine ? "active" : ""}
            onClick={() => setMine(false)}
          >
            Alle Fahrten
          </button>
        )}
        <a href={`/api/v1/trips?vtcId=vtc-ngl&mine=${mine ? 1 : 0}&format=csv`}>
          CSV exportieren
        </a>
        <button onClick={() => window.print()}>PDF / Drucken</button>
      </div>
      {message && <p className="tripbook-message">{message}</p>}
      <div className="tripbook-layout">
        <section className="tripbook-list">
          <h2>{data.trips.length} Fahrten</h2>
          {data.trips.map((t) => (
            <button
              key={t.id}
              className={selected?.id === t.id ? "selected" : ""}
              onClick={() => setSelected(t)}
            >
              <div>
                <strong>
                  {t.sourceCity ?? "Start"} → {t.destinationCity ?? "Ziel"}
                </strong>
                <span>
                  {t.driver} · {t.game} · {t.cargo}
                </span>
              </div>
              <b>{t.distanceKm.toFixed(1)} km</b>
              <em>{t.status}</em>
            </button>
          ))}
        </section>
        <section className="tripbook-detail">
          {selected ? (
            <>
              <span className="kicker">FAHRT {selected.id.slice(0, 8)}</span>
              <h2>
                {selected.sourceCity} → {selected.destinationCity}
              </h2>
              <div className="tripbook-stats">
                {[
                  ["Fahrer", selected.driver],
                  ["Spiel", selected.game],
                  ["Modus", selected.mode ?? "—"],
                  ["Fracht", selected.cargo ?? "—"],
                  ["Kilometer", `${selected.distanceKm.toFixed(1)} km`],
                  ["Verbrauch", `${selected.fuelLiters.toFixed(1)} l`],
                  ["Schaden", `${selected.damage.toFixed(1)} %`],
                  ["Einnahmen", `${selected.income.toFixed(2)} V€`],
                  ["Quelle", selected.telemetrySource],
                  ["Status", selected.status],
                ].map((x) => (
                  <article key={x[0]}>
                    <span>{x[0]}</span>
                    <strong>{x[1]}</strong>
                  </article>
                ))}
              </div>
              <form
                className="trip-comment"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    await act({
                      action: "comment",
                      tripId: selected.id,
                      comment: f.get("comment"),
                      internal: f.get("internal") === "on",
                    })
                  )
                    e.currentTarget.reset();
                }}
              >
                <textarea
                  name="comment"
                  required
                  placeholder="Kommentar zur Fahrt"
                />
                <label>
                  <input name="internal" type="checkbox" /> Nur für Personal
                </label>
                <button>Kommentar speichern</button>
              </form>
              <div className="trip-comments">
                {data.comments
                  .filter((c) => c.tripId === selected.id)
                  .map((c) => (
                    <article key={c.id}>
                      <strong>
                        {c.author}
                        {c.internal ? " · Intern" : ""}
                      </strong>
                      <p>{c.body}</p>
                      <small>
                        {new Date(c.createdAt).toLocaleString("de-DE")}
                      </small>
                    </article>
                  ))}
              </div>
              {data.canReview && (
                <>
                  <form
                    className="trip-correction"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await act({
                        action: "correct",
                        tripId: selected.id,
                        field: f.get("field"),
                        value: f.get("value"),
                        reason: f.get("reason"),
                      });
                    }}
                  >
                    <select name="field">
                      <option value="distance_km">Kilometer</option>
                      <option value="fuel_liters">Kraftstoff</option>
                      <option value="damage">Schaden</option>
                      <option value="income">Einnahmen</option>
                      <option value="source_city">Startort</option>
                      <option value="destination_city">Zielort</option>
                      <option value="cargo">Fracht</option>
                    </select>
                    <input name="value" required placeholder="Neuer Wert" />
                    <input
                      name="reason"
                      required
                      placeholder="Korrekturgrund"
                    />
                    <button>Korrigieren</button>
                  </form>
                  <div className="trip-review">
                    <button
                      onClick={() =>
                        act({
                          action: "review",
                          tripId: selected.id,
                          status: "approved",
                        })
                      }
                    >
                      Freigeben
                    </button>
                    <button
                      onClick={() =>
                        act({
                          action: "review",
                          tripId: selected.id,
                          status: "rejected",
                          reason: "Durch Personal abgelehnt",
                        })
                      }
                    >
                      Ablehnen
                    </button>
                  </div>
                </>
              )}
              <div className="trip-edits">
                {data.edits
                  .filter((e) => e.tripId === selected.id)
                  .map((e, i) => (
                    <small key={i}>
                      {e.actor}: {e.field} · {e.oldValue} → {e.newValue}
                    </small>
                  ))}
              </div>
            </>
          ) : (
            <ManualTrip save={act} />
          )}
        </section>
      </div>
    </main>
  );
}
function ManualTrip({ save }: { save: (b: unknown) => Promise<void> }) {
  return (
    <div>
      <span className="kicker">MANUELLE ERFASSUNG</span>
      <h2>Fahrt nachtragen</h2>
      <form
        className="manual-trip"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          await save({
            action: "manual",
            trip: {
              ...f,
              distanceKm: Number(f.distanceKm),
              fuelLiters: Number(f.fuelLiters),
              damage: Number(f.damage),
              income: Number(f.income),
            },
          });
        }}
      >
        <label>
          Spiel
          <select name="game">
            <option>ETS2</option>
            <option>ATS</option>
          </select>
        </label>
        <label>
          Modus
          <select name="mode">
            <option>Singleplayer</option>
            <option>Convoy</option>
            <option>TruckersMP</option>
          </select>
        </label>
        <label>
          Startort
          <input name="sourceCity" required />
        </label>
        <label>
          Zielort
          <input name="destinationCity" required />
        </label>
        <label>
          Fracht
          <input name="cargo" />
        </label>
        <label>
          Kilometer
          <input name="distanceKm" type="number" step="0.1" required />
        </label>
        <label>
          Kraftstoff
          <input name="fuelLiters" type="number" step="0.1" />
        </label>
        <label>
          Schaden %<input name="damage" type="number" step="0.1" />
        </label>
        <label>
          Einnahmen
          <input name="income" type="number" step="0.01" />
        </label>
        <label>
          Start
          <input name="startedAt" type="datetime-local" />
        </label>
        <label>
          Ende
          <input name="completedAt" type="datetime-local" />
        </label>
        <button>Zur Prüfung einreichen</button>
      </form>
    </div>
  );
}

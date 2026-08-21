"use client";
import { useEffect, useMemo, useState } from "react";
import PublicNav from "./components/PublicNav";
type Vtc = {
  id: string;
  slug: string;
  name: string;
  tag: string;
  description: string;
  country: string;
  city?: string;
  games: string[];
  languages: string[];
  verified: number;
  applicationsOpen: number;
  minimumAge: number;
  driverCount: number;
  totalKm: number;
  activity: number;
  rating: number;
  followers: number;
  partnerSeeking: number;
  beginnerFriendly: number;
  drivingModes: string[];
  primaryColor?: string;
  secondaryColor?: string;
  logoUploadId?: string;
  headerUploadId?: string;
};
export default function DirectoryClient() {
  const [rows, setRows] = useState<Vtc[]>([]),
    [query, setQuery] = useState(""),
    [game, setGame] = useState(""),
    [language, setLanguage] = useState(""),
    [country, setCountry] = useState(""),
    [sort, setSort] = useState("recommended"),
    [open, setOpen] = useState(false),
    [verified, setVerified] = useState(false),
    [beginner, setBeginner] = useState(false),
    [partner, setPartner] = useState(false),
    [style, setStyle] = useState(""),
    [favorites, setFavorites] = useState<string[]>([]),
    [compare, setCompare] = useState<string[]>([]),
    [message, setMessage] = useState("");
  useEffect(() => {
    try {
      setFavorites(JSON.parse(localStorage.getItem("vtc-favorites") || "[]"));
    } catch {}
    const oauthHash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const oauthToken = oauthHash.get("access_token");
    const finishOAuth = oauthToken
      ? fetch("/api/auth/supabase/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: oauthToken }),
        }).then((r) => {
          if (r.ok) history.replaceState({}, "", "/");
          return r.ok;
        })
      : Promise.resolve(false);
    finishOAuth.catch(() => undefined);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (game) p.set("game", game);
    if (language) p.set("language", language);
    if (country) p.set("country", country);
    if (open) p.set("open", "true");
    if (verified) p.set("verified", "true");
    if (beginner) p.set("beginner", "true");
    if (partner) p.set("partner", "true");
    if (style) p.set("style", style);
    p.set("sort", sort);
    const t = setTimeout(
      () =>
        fetch(`/api/v1/vtcs?${p}`)
          .then((r) => r.json())
          .then((j) => setRows(j.data || [])),
      180,
    );
    return () => clearTimeout(t);
  }, [
    query,
    game,
    language,
    country,
    sort,
    open,
    verified,
    beginner,
    partner,
    style,
  ]);
  const countries = useMemo(
      () => [...new Set(rows.map((x) => x.country))],
      [rows],
    ),
    languages = useMemo(
      () => [...new Set(rows.flatMap((x) => x.languages))],
      [rows],
    );
  function fav(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    setFavorites(next);
    localStorage.setItem("vtc-favorites", JSON.stringify(next));
  }
  function cmp(id: string) {
    setCompare((x) =>
      x.includes(id)
        ? x.filter((y) => y !== id)
        : x.length < 3
          ? [...x, id]
          : x,
    );
  }
  return (
    <main>
      <PublicNav active="companies" />
      <section className="hero" id="top">
        <div className="road-lines" />
        <div className="game-ribbon" aria-label="Unterstützte Spiele">
          <article className="ets-card">
            <span>EUROPE</span>
            <strong>ETS2</strong>
            <small>EURO TRUCK SIMULATOR 2</small>
          </article>
          <div className="game-ribbon-road"><i /><i /><i /></div>
          <article className="ats-card">
            <span>AMERICA</span>
            <strong>ATS</strong>
            <small>AMERICAN TRUCK SIMULATOR</small>
          </article>
        </div>
        <div className="eyebrow">
          <span className="live-dot" /> DIE PLATTFORM FÜR VIRTUELLE SPEDITIONEN
        </div>
        <h1>
          Zwei Welten.
          <br />
          <span>Ein Truck Hub.</span>
        </h1>
        <p>
          Durchsuche echte Speditionsprofile für ETS2 und ATS nach Sprache,
          Land, Fahrweise, Aktivität und Bewerbungslage.
        </p>
        <div className="search-shell">
          <span className="search-icon">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Spedition, Tag, Stadt oder Land suchen …"
          />
          <button
            onClick={() =>
              document
                .querySelector("#directory")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Suchen
          </button>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{rows.length}</strong>
            <span>sichtbare Speditionen</span>
          </div>
          <div>
            <strong>{rows.reduce((n, x) => n + x.driverCount, 0)}</strong>
            <span>Fahrer</span>
          </div>
          <div>
            <strong>
              {Math.round(
                rows.reduce((n, x) => n + x.totalKm, 0),
              ).toLocaleString("de-DE")}
            </strong>
            <span>Kilometer</span>
          </div>
          <div>
            <strong>{countries.length}</strong>
            <span>Länder</span>
          </div>
        </div>
      </section>
      <section className="directory" id="directory">
        <div className="section-head">
          <div>
            <span className="kicker">SPEDITIONEN ENTDECKEN</span>
            <h2>Finde deine nächste Crew</h2>
            <p>
              {rows.length} Treffer · empfohlen, neu, aktiv oder nach Leistung
              sortierbar.
            </p>
          </div>
          <select
            className="directory-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recommended">Empfohlen</option>
            <option value="newest">Neueste</option>
            <option value="active">Aktivste</option>
            <option value="km">Meiste Kilometer</option>
            <option value="jobs">Meiste Aufträge</option>
            <option value="rating">Beste Bewertung</option>
            <option value="drivers">Meiste Fahrer</option>
          </select>
        </div>
        <div className="filters">
          {[
            ["Alle Spiele", ""],
            ["ETS2", "ETS2"],
            ["ATS", "ATS"],
          ].map(([l, v]) => (
            <button
              className={game === v ? "selected" : ""}
              onClick={() => setGame(v)}
              key={l}
            >
              {l}
            </button>
          ))}
          <span className="divider" />
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Alle Länder</option>
            {countries.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="">Alle Sprachen</option>
            {languages.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="">Alle Fahrweisen</option>
            <option>Realistisch</option>
            <option>Frei</option>
            <option>Convoy-orientiert</option>
            <option>Karriere-orientiert</option>
          </select>
          <button
            className={open ? "selected" : ""}
            onClick={() => setOpen(!open)}
          >
            Bewerbungen offen
          </button>
          <button
            className={verified ? "selected" : ""}
            onClick={() => setVerified(!verified)}
          >
            Verifiziert
          </button>
          <button
            className={beginner ? "selected" : ""}
            onClick={() => setBeginner(!beginner)}
          >
            Anfängerfreundlich
          </button>
          <button
            className={partner ? "selected" : ""}
            onClick={() => setPartner(!partner)}
          >
            Partner gesucht
          </button>
        </div>
        <div className="company-grid">
          {rows.map((c, i) => (
            <article
              className="company-card"
              style={
                {
                  "--card-accent": c.primaryColor || "#22d3c5",
                } as React.CSSProperties
              }
              key={c.id}
            >
              <div
                className="card-cover"
                style={{
                  backgroundColor: c.secondaryColor || undefined,
                  backgroundImage: c.headerUploadId
                    ? `linear-gradient(90deg,rgba(5,20,29,.62),rgba(5,20,29,.12)),url(/api/v1/uploads?id=${c.headerUploadId})`
                    : undefined,
                }}
              >
                <span className="cover-code">
                  {String(i + 1).padStart(2, "0")} / VTC
                </span>
                <button
                  className={
                    favorites.includes(c.id) ? "favorite on" : "favorite"
                  }
                  onClick={() => fav(c.id)}
                >
                  ♥
                </button>
              </div>
              <div className="card-body">
                <div className="logo">
                  {c.logoUploadId ? (
                    <img src={`/api/v1/uploads?id=${c.logoUploadId}`} alt={`${c.name} Logo`} />
                  ) : c.tag}
                </div>
                <div className="company-title">
                  <h3>
                    {c.name}{" "}
                    {c.verified ? <span className="verified">✓</span> : null}
                  </h3>
                  <span>
                    {c.tag} · {c.country}
                    {c.city ? ` · ${c.city}` : ""}
                  </span>
                </div>
                <div className="badges">
                  {c.games.map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                  <span className={c.applicationsOpen ? "open" : "closed"}>
                    {c.applicationsOpen ? "Bewerbungen offen" : "Geschlossen"}
                  </span>
                </div>
                <p>{c.description}</p>
                <div className="card-stats">
                  <div>
                    <strong>{c.driverCount}</strong>
                    <span>Fahrer</span>
                  </div>
                  <div>
                    <strong>
                      {Math.round(c.totalKm).toLocaleString("de-DE")}
                    </strong>
                    <span>Kilometer</span>
                  </div>
                  <div>
                    <strong>{Number(c.rating).toFixed(1)} ★</strong>
                    <span>{c.followers} Follower</span>
                  </div>
                </div>
                <div className="directory-card-actions">
                  <button
                    className={compare.includes(c.id) ? "selected" : ""}
                    onClick={() => cmp(c.id)}
                  >
                    Vergleichen
                  </button>
                  <a className="profile-button" href={`/vtc/${c.slug}`}>
                    Profil ansehen →
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!rows.length && (
          <p className="directory-empty">
            Keine Spedition passt zu diesen Filtern.
          </p>
        )}
      </section>
      {compare.length > 1 && (
        <section className="compare-drawer">
          <header>
            <h2>Speditionen vergleichen</h2>
            <button onClick={() => setCompare([])}>Schließen</button>
          </header>
          <div>
            {rows
              .filter((x) => compare.includes(x.id))
              .map((c) => (
                <article key={c.id}>
                  <h3>{c.name}</h3>
                  <p>
                    {c.games.join(" & ")} · {c.country}
                  </p>
                  <b>{c.driverCount} Fahrer</b>
                  <b>{c.totalKm.toLocaleString("de-DE")} km</b>
                  <b>{Number(c.rating).toFixed(1)} ★</b>
                  <span>ab {c.minimumAge} Jahren</span>
                </article>
              ))}
          </div>
        </section>
      )}
      <section className="create-vtc" id="create">
        <div>
          <span className="kicker">EIGENE SPEDITION</span>
          <h2>Öffentliches Profil anlegen</h2>
          <p>
            Nach der Anmeldung wird dein Gründerkonto automatisch als
            geschützter Geschäftsführer eingetragen.
          </p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget)),
              r = await fetch("/api/v1/vtcs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "create",
                  data: {
                    ...f,
                    games: [f.game],
                    languages: String(f.languages)
                      .split(",")
                      .map((x) => x.trim()),
                  },
                }),
              }),
              j = await r.json();
            if (r.status === 401) {
              location.href = "/konto";
              return;
            }
            setMessage(r.ok ? "Spedition wurde angelegt." : j.error);
            if (r.ok) location.href = `/vtc/${j.slug}`;
          }}
        >
          <input name="name" placeholder="Speditionsname" required />
          <input name="tag" placeholder="Kürzel" required />
          <input name="slug" placeholder="kurze-adresse" required />
          <select name="game">
            <option>ETS2</option>
            <option>ATS</option>
            <option value="ETS2,ATS">ETS2 & ATS</option>
          </select>
          <input name="country" placeholder="Land" required />
          <input name="city" placeholder="Standort" />
          <input name="languages" placeholder="Deutsch, Englisch" />
          <textarea name="description" placeholder="Firmenbeschreibung" />
          <button className="primary">Spedition anlegen</button>
          {message && <p>{message}</p>}
        </form>
      </section>
      <section className="live-strip">
        <div>
          <span className="live-dot" /> LIVE AUF DER STRASSE
        </div>
        <strong>
          {rows.reduce((n, x) => n + x.activity, 0)} Fahrten in den letzten 30
          Tagen
        </strong>
        <a href="/live-map">Live-Map öffnen →</a>
      </section>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
type Data = {
  vtc: any;
  drivers: any[];
  roles: any[];
  events: any[];
  stats: any;
  reviews: any[];
  gallery: any[];
  followers: number;
  following: boolean;
  user: any;
};
export default function DynamicVtcProfile({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState("Übersicht"),
    [message, setMessage] = useState("");
  async function load() {
    const r = await fetch(`/api/v1/vtcs?slug=${encodeURIComponent(slug)}`);
    if (!r.ok) {
      setMessage("Spedition wurde nicht gefunden oder ist nicht öffentlich.");
      return;
    }
    setData(await r.json());
  }
  useEffect(() => {
    load();
  }, [slug]);
  async function act(body: object) {
    const r = await fetch("/api/v1/vtcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      }),
      j = await r.json();
    if (r.status === 401) {
      location.href = "/konto";
      return;
    }
    setMessage(
      r.ok
        ? j.moderation
          ? "Bewertung wurde zur Moderation eingereicht."
          : "Aktion wurde gespeichert."
        : j.error,
    );
    if (r.ok) await load();
  }
  if (!data)
    return (
      <main className="profile-page">
        <section className="white-panel empty-state">
          <h2>{message || "Speditionsprofil wird geladen …"}</h2>
          <a href="/">Zum Verzeichnis</a>
        </section>
      </main>
    );
  const v = data.vtc,
    visible = (key: string) => v.visibility?.[key] !== false;
  return (
    <main
      className="profile-page"
      style={
        {
          "--vtc-primary": v.primaryColor || "#22d3c5",
          "--vtc-secondary": v.secondaryColor || "#0d202d",
        } as React.CSSProperties
      }
    >
      <header className="nav compact">
        <a className="brand" href="/">
          <span className="brand-mark">CH</span>
          <span>
            CONVOY<span>HUB</span>
          </span>
        </a>
        <nav>
          <a href="/">Speditionen</a>
          <a href="/live-map">Live-Map</a>
          <a href="/statistik">Statistik</a>
        </nav>
        <div className="nav-actions">
          <a className="login" href="/konto">
            Anmelden
          </a>
          <a className="primary" href="/dashboard">
            Dashboard
          </a>
        </div>
      </header>
      <section
        className="profile-cover"
        style={{
          backgroundColor: v.secondaryColor || undefined,
          backgroundImage: v.headerUploadId
            ? `linear-gradient(90deg,rgba(4,18,27,.76),rgba(4,18,27,.22)),url(/api/v1/uploads?id=${v.headerUploadId})`
            : undefined,
        }}
      >
        <div className="profile-cover-grid" />
        <div className="cover-inner">
          {v.verified ? (
            <span className="verified-label">✓ VERIFIZIERTE SPEDITION</span>
          ) : (
            <span className="verified-label">ÖFFENTLICHE SPEDITION</span>
          )}
          <p>
            {v.foundedAt
              ? `GEGRÜNDET ${new Date(v.foundedAt).toLocaleDateString("de-DE")}`
              : "VIRTUELLE SPEDITION"}{" "}
            · {v.city || v.country}
          </p>
        </div>
      </section>
      <section className="identity-wrap">
        <div className="identity-logo">
          {v.logoUploadId ? (
            <img src={`/api/v1/uploads?id=${v.logoUploadId}`} alt={`${v.name} Logo`} />
          ) : v.tag}
        </div>
        <div className="identity-main">
          <div>
            <h1>
              {v.name} {v.verified ? <span className="verified">✓</span> : null}
            </h1>
            <p>
              {v.tag} · {v.country}
              {v.city ? ` · ${v.city}` : ""}
            </p>
          </div>
          <div className="identity-actions">
            <button
              className={data.following ? "outline following" : "outline"}
              onClick={() => act({ action: "follow" })}
            >
              {data.following ? "✓ Gefolgt" : "+ Folgen"} · {data.followers}
            </button>
            {v.applicationsOpen ? (
              <a className="primary apply" href={`/bewerbungen?vtc=${v.id}`}>
                Jetzt bewerben →
              </a>
            ) : (
              <span className="status-pill">Bewerbungen geschlossen</span>
            )}
          </div>
        </div>
        <nav className="profile-tabs">
          {[
            "Übersicht",
            "Fahrer",
            "Ränge",
            "Events",
            "Statistik",
            "Galerie",
            "Bewertungen",
            "Kontakt",
          ].map((x) => (
            <button
              className={tab === x ? "active" : ""}
              onClick={() => setTab(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </nav>
      </section>
      {message && <p className="profile-message">{message}</p>}
      <div className="profile-layout">
        <div className="profile-content">
          {tab === "Übersicht" && (
            <>
              {visible("about") && (
                <section className="white-panel about">
                  <span className="kicker">ÜBER UNS</span>
                  <h2>{v.motto || v.name}</h2>
                  <p>{v.description}</p>
                  {v.history && (
                    <>
                      <h3>Unternehmensgeschichte</h3>
                      <p>{v.history}</p>
                    </>
                  )}
                  {v.motto && <blockquote>„{v.motto}“</blockquote>}
                  <div className="values">
                    <div>
                      <strong>
                        {v.beginnerFriendly ? "Anfängerfreundlich" : "Erfahren"}
                      </strong>
                      <span>Community-Ausrichtung</span>
                    </div>
                    {v.driving_modes?.slice(0, 2).map((x: string) => (
                      <div key={x}>
                        <strong>{x}</strong>
                        <span>Fahrweise</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {visible("rules") && (
                <section className="white-panel">
                  <span className="kicker">BEWERBUNG & REGELN</span>
                  <h2>Das erwarten wir</h2>
                  <h3>Voraussetzungen</h3>
                  <ul>
                    {v.requirements?.length ? (
                      v.requirements.map((x: string) => <li key={x}>{x}</li>)
                    ) : (
                      <li>Informationen werden von der Spedition ergänzt.</li>
                    )}
                  </ul>
                  <h3>Firmenregeln</h3>
                  <ol>
                    {v.rules?.map((x: string) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ol>
                  {v.probationInfo && (
                    <>
                      <h3>Probezeit</h3>
                      <p>{v.probationInfo}</p>
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {tab === "Fahrer" && (
            <section className="white-panel">
              <span className="kicker">ÖFFENTLICHE FAHRERLISTE</span>
              <h2>{data.drivers.length} Mitglieder</h2>
              <div className="driver-list expanded">
                {data.drivers.map((d) => (
                  <div className="driver" key={d.id}>
                    <span
                      className={`avatar ${d.status === "active" ? "online" : "away"}`}
                    >
                      {d.avatarUploadId ? (
                        <img src={`/api/v1/uploads?id=${d.avatarUploadId}`} alt="" />
                      ) : d.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>{d.name}</strong>
                      <small>
                        {d.role || d.status} · #{d.driverNumber || "—"}
                      </small>
                    </div>
                    <span>{Number(d.km).toLocaleString("de-DE")} km</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {tab === "Ränge" && (
            <section className="white-panel">
              <span className="kicker">RANG- UND ABTEILUNGSÜBERSICHT</span>
              <h2>Rollen der Spedition</h2>
              <div className="rank-grid">
                {data.roles.map((r) => (
                  <article key={r.name} style={{ borderColor: r.color }}>
                    <b style={{ color: r.color }}>{r.name}</b>
                    <span>Rangstufe {r.rank}</span>
                  </article>
                ))}
              </div>
            </section>
          )}
          {tab === "Events" && (
            <section className="white-panel">
              <span className="kicker">KOMMENDE EVENTS</span>
              <h2>Zusammen unterwegs</h2>
              {data.events.length ? (
                data.events.map((e) => (
                  <article className="event-card" key={e.id}>
                    <div className="event-date">
                      <strong>{new Date(e.starts_at).getDate()}</strong>
                      <span>
                        {new Date(e.starts_at).toLocaleString("de-DE", {
                          month: "short",
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="game-tag">
                        {e.game} · {e.server || "Convoy"}
                      </span>
                      <h3>{e.name}</h3>
                      <p>
                        {e.source_city} → {e.destination_city} ·{" "}
                        {new Date(e.starts_at).toLocaleString("de-DE")}
                      </p>
                    </div>
                  </article>
                ))
              ) : (
                <p>Noch keine öffentlichen Events.</p>
              )}
            </section>
          )}
          {tab === "Statistik" && (
            <section className="white-panel">
              <span className="kicker">ÖFFENTLICHE STATISTIK</span>
              <h2>
                {Number(data.stats?.km || 0).toLocaleString("de-DE")} Kilometer
              </h2>
              <div className="profile-stat-grid">
                <div>
                  <b>{data.stats?.trips || 0}</b>
                  <span>Fahrten</span>
                </div>
                <div>
                  <b>{Number(data.stats?.damage || 0).toFixed(2)} %</b>
                  <span>Ø Schaden</span>
                </div>
                <div>
                  <b>{Number(data.stats?.consumption || 0).toFixed(1)}</b>
                  <span>l/100 km</span>
                </div>
                <div>
                  <b>{v.driverCount || data.drivers.length}</b>
                  <span>Fahrer</span>
                </div>
              </div>
            </section>
          )}
          {tab === "Bewertungen" && (
            <section className="white-panel">
              <span className="kicker">MODERIERTE BEWERTUNGEN</span>
              <h2>Erfahrungen der Community</h2>
              {data.reviews.map((r, i) => (
                <article className="review-card" key={i}>
                  <b>
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </b>
                  <p>{r.body}</p>
                  <small>
                    {r.author} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("de-DE")}
                  </small>
                </article>
              ))}
              <form
                className="profile-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  act({
                    action: "review",
                    rating: Number(f.rating),
                    body: f.body,
                  });
                }}
              >
                <h3>Bewertung abgeben</h3>
                <select name="rating">
                  <option value="5">5 Sterne</option>
                  <option value="4">4 Sterne</option>
                  <option value="3">3 Sterne</option>
                  <option value="2">2 Sterne</option>
                  <option value="1">1 Stern</option>
                </select>
                <textarea name="body" required />
                <button className="primary">Zur Moderation senden</button>
              </form>
            </section>
          )}
          {tab === "Galerie" && (
            <section className="white-panel">
              <span className="kicker">ÖFFENTLICHE GALERIE</span>
              <h2>Momente der Spedition</h2>
              {data.gallery?.length ? (
                <div className="profile-gallery">
                  {data.gallery.map((item) => (
                    <figure key={item.id}>
                      <img src={item.url} alt={item.caption || "Galeriebild"} />
                      <figcaption>
                        <b>{item.caption || "Unterwegs mit der Crew"}</b>
                        <small>{item.owner} · {new Date(item.createdAt).toLocaleDateString("de-DE")}</small>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p>Noch keine freigegebenen Galeriebilder.</p>
              )}
              <a className="primary" href="/galerie">Bild zur Galerie hinzufügen</a>
            </section>
          )}
          {tab === "Kontakt" && (
            <section className="white-panel">
              <span className="kicker">KONTAKT</span>
              <h2>{v.contactName || v.name} erreichen</h2>
              <form
                className="profile-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  act({ action: "contact", ...f });
                }}
              >
                <input name="name" placeholder="Dein Name" required />
                <input name="email" type="email" placeholder="E-Mail" />
                <input name="subject" placeholder="Betreff" required />
                <textarea name="body" placeholder="Nachricht" required />
                <button className="primary">Nachricht senden</button>
              </form>
              <form
                className="profile-form report"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  act({ action: "report", ...f });
                }}
              >
                <h3>Profil oder Inhalt melden</h3>
                <input name="reason" placeholder="Meldegrund" required />
                <textarea name="body" placeholder="Beschreibung" />
                <button>Zur Moderation melden</button>
              </form>
            </section>
          )}
        </div>
        <aside>
          <section className="side-card status-card">
            <span className="status-pill">
              <i />{" "}
              {v.applicationsOpen
                ? "BEWERBUNGEN GEÖFFNET"
                : "BEWERBUNGEN GESCHLOSSEN"}
            </span>
            <h3>{v.motto || "Werde Teil der Crew"}</h3>
            <p>Mindestalter: {v.minimumAge} Jahre.</p>
          </section>
          <section className="side-card facts">
            <h3>Speditionsdetails</h3>
            <dl>
              <div>
                <dt>Spiele</dt>
                <dd>{v.games.join(" & ")}</dd>
              </div>
              <div>
                <dt>Hauptsprache</dt>
                <dd>{v.mainLanguage || v.languages[0]}</dd>
              </div>
              <div>
                <dt>Weitere Sprachen</dt>
                <dd>{v.languages.join(", ")}</dd>
              </div>
              <div>
                <dt>Zeitzone</dt>
                <dd>{v.timezone}</dd>
              </div>
              <div>
                <dt>TruckersMP VTC-ID</dt>
                <dd>{v.truckersmpId || "—"}</dd>
              </div>
              <div>
                <dt>Mindestalter</dt>
                <dd>{v.minimumAge} Jahre</dd>
              </div>
            </dl>
          </section>
          <section className="side-card contact">
            <h3>Links</h3>
            {v.discordUrl && (
              <a href={v.discordUrl}>
                Discord beitreten <span>↗</span>
              </a>
            )}
            {v.websiteUrl && (
              <a href={v.websiteUrl}>
                Webseite <span>↗</span>
              </a>
            )}
            {v.social_links &&
              Object.entries(v.social_links).map(([k, url]) => (
                <a href={String(url)} key={k}>
                  {k}
                  <span>↗</span>
                </a>
              ))}
          </section>
        </aside>
      </div>
    </main>
  );
}

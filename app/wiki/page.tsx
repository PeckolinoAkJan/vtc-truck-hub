"use client";
import { useEffect, useMemo, useState } from "react";
export default function Wiki() {
  const [data, setData] = useState<any>(null),
    [tab, setTab] = useState("Wissensbereich"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [message, setMessage] = useState("");
  async function load() {
    setData(await (await fetch("/api/v1/resources")).json());
  }
  useEffect(() => {
    load();
  }, []);
  async function act(body: object) {
    const r = await fetch("/api/v1/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({  ...body }),
      }),
      j = await r.json();
    setMessage(
      r.ok
        ? `Gespeichert${j.score != null ? ` · Ergebnis ${j.score}%` : ""}.`
        : j.error,
    );
    if (r.ok) await load();
  }
  const articles = useMemo(
    () =>
      data?.articles.filter((a: any) =>
        `${a.title} ${a.category} ${a.body}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ) || [],
    [data, query],
  );
  if (!data)
    return <main className="resource-loading">Wiki wird geladen …</main>;
  return (
    <main className="wiki-page">
      <header>
        <div>
          <span>VTC TRUCK HUB · WISSEN & SCHULUNGEN</span>
          <h1>Handbücher, Kurse und Zertifikate</h1>
        </div>
        <nav>
          <a href="/downloads">Downloads</a>
          <a href="/dashboard">Dashboard</a>
        </nav>
      </header>
      <nav>
        <button
          className={tab === "Wissensbereich" ? "active" : ""}
          onClick={() => setTab("Wissensbereich")}
        >
          Wissensbereich
        </button>
        <button
          className={tab === "Schulungen" ? "active" : ""}
          onClick={() => setTab("Schulungen")}
        >
          Schulungen
        </button>
        {data.canManage && (
          <button
            className={tab === "Verwaltung" ? "active" : ""}
            onClick={() => setTab("Verwaltung")}
          >
            Inhalte verwalten
          </button>
        )}
      </nav>
      {message && <p className="wiki-message">{message}</p>}
      {tab === "Wissensbereich" && (
        <section className="wiki-layout">
          <aside>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Wiki durchsuchen …"
            />
            {[...new Set(articles.map((a: any) => a.category))].map((c) => (
              <section key={String(c)}>
                <h3>{String(c)}</h3>
                {articles
                  .filter((a: any) => a.category === c)
                  .map((a: any) => (
                    <button
                      className={selected?.id === a.id ? "active" : ""}
                      onClick={() => setSelected(a)}
                      key={a.id}
                    >
                      {a.title}
                    </button>
                  ))}
              </section>
            ))}
          </aside>
          <article>
            {selected ? (
              <>
                <small>
                  {selected.category} · Version {selected.version}
                </small>
                <h1>{selected.title}</h1>
                <div className="article-body">
                  {selected.body.split("\n").map((x: string, i: number) => (
                    <p key={i}>{x}</p>
                  ))}
                </div>
                <footer>
                  <span>
                    Zuletzt aktualisiert{" "}
                    {new Date(selected.updated_at).toLocaleString("de-DE")} ·{" "}
                    {selected.author}
                  </span>
                  {selected.requires_acknowledgement &&
                    !selected.acknowledgedAt &&
                    data.user && (
                      <button
                        onClick={() => act({ action: "ack", id: selected.id })}
                      >
                        Gelesen & verstanden
                      </button>
                    )}
                  {selected.acknowledgedAt && <b>✓ Bestätigt</b>}
                </footer>
              </>
            ) : (
              <p>Wähle links einen Artikel aus.</p>
            )}
          </article>
        </section>
      )}
      {tab === "Schulungen" && (
        <section className="course-grid">
          {data.courses.map((c: any) => {
            const p = data.progress.find((x: any) => x.course_id === c.id);
            return (
              <article key={c.id}>
                <small>{c.category}</small>
                <h2>{c.title}</h2>
                <p>{c.description}</p>
                <ol>
                  {c.content.map((x: string) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
                <div>
                  <i style={{ width: `${p?.progress || 0}%` }} />
                </div>
                <span>
                  {p?.status || "Nicht begonnen"}{" "}
                  {p?.score != null && `· ${p.score}%`}
                </span>
                {data.user && (
                  <button
                    onClick={() =>
                      act({
                        action: "progress",
                        id: c.id,
                        data: {
                          progress: 100,
                          answers: c.questions.map(() => 0),
                        },
                      })
                    }
                  >
                    Prüfung abschließen
                  </button>
                )}
                {p?.status === "completed" && (
                  <strong>🏅 {c.certificate_name || "Zertifikat"}</strong>
                )}
              </article>
            );
          })}
        </section>
      )}
      {tab === "Verwaltung" && data.canManage && (
        <section className="resource-admin">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              act({
                action: "article",
                data: {
                  ...Object.fromEntries(f),
                  published: f.get("published") === "on",
                  requiresAcknowledgement:
                    f.get("requiresAcknowledgement") === "on",
                },
              });
            }}
          >
            <h2>Artikel erstellen</h2>
            <input name="title" placeholder="Titel" required />
            <input name="slug" placeholder="adresse" required />
            <input name="category" placeholder="Kategorie" required />
            <select name="visibility">
              <option>public</option>
              <option>internal</option>
              <option>staff</option>
            </select>
            <textarea name="body" placeholder="Inhalt" required />
            <label>
              <input type="checkbox" name="requiresAcknowledgement" />{" "}
              Lesebestätigung
            </label>
            <label>
              <input type="checkbox" name="published" /> Veröffentlicht
            </label>
            <button>Artikel speichern</button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              act({
                action: "course",
                data: {
                  ...Object.fromEntries(f),
                  published: f.get("published") === "on",
                },
              });
            }}
          >
            <h2>Kurs erstellen</h2>
            <input name="title" placeholder="Titel" required />
            <input name="category" placeholder="Kategorie" required />
            <textarea name="description" placeholder="Beschreibung" />
            <input name="content" placeholder="Modul 1, Modul 2" />
            <textarea
              name="questions"
              defaultValue='[{"question":"Beispielfrage","options":["Richtig","Falsch"],"answer":0}]'
            />
            <input name="passingScore" type="number" defaultValue="80" />
            <input name="certificateName" placeholder="Zertifikat" />
            <label>
              <input type="checkbox" name="published" /> Veröffentlicht
            </label>
            <button>Kurs speichern</button>
          </form>
        </section>
      )}
    </main>
  );
}

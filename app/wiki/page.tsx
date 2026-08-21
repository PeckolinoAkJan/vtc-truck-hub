"use client";

import { useEffect, useMemo, useState } from "react";
import PublicNav from "../components/PublicNav";

type WikiTab = { id: string; slug: string; title: string; summary: string; body: string; updatedAt: string };

function WikiBody({ body }: { body: string }) {
  return <div className="public-wiki-body">{body.split("\n").map((line, index) => {
    const value = line.trim();
    if (!value) return <span className="wiki-space" key={index} />;
    if (value.startsWith("## ")) return <h2 key={index}>{value.slice(3)}</h2>;
    if (value.startsWith("### ")) return <h3 key={index}>{value.slice(4)}</h3>;
    if (value.startsWith("- ")) return <p className="wiki-list-item" key={index}>✓ {value.slice(2)}</p>;
    return <p key={index}>{value}</p>;
  })}</div>;
}

export default function PublicWiki() {
  const [tabs, setTabs] = useState<WikiTab[]>([]), [selected, setSelected] = useState(""), [query, setQuery] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/v1/public-content?type=wiki", { cache: "no-store" }).then((r) => r.json()).then((payload) => { const rows = payload.data ?? []; setTabs(rows); const hash = location.hash.slice(1); setSelected(rows.some((r: WikiTab) => r.slug === hash) ? hash : rows[0]?.slug ?? ""); }).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => tabs.filter((tab) => `${tab.title} ${tab.summary} ${tab.body}`.toLowerCase().includes(query.toLowerCase())), [tabs, query]);
  const current = tabs.find((tab) => tab.slug === selected) ?? filtered[0];
  function choose(slug: string) { setSelected(slug); history.replaceState({}, "", `/wiki#${slug}`); }
  return <main className="public-wiki-page"><PublicNav active="wiki" />
    <section className="public-page-hero"><span className="kicker">VTC TRUCK HUB · WISSEN</span><h1>Wikipedia</h1><p>Anleitungen und Erklärungen zur Plattform und zum Desktop-Client – öffentlich, aktuell und direkt von der Plattformverwaltung gepflegt.</p><label><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Wikipedia durchsuchen …" /></label></section>
    {loading ? <div className="public-empty"><b>Wikipedia wird geladen …</b></div> : !tabs.length ? <div className="public-empty"><b>Noch keine Artikel veröffentlicht</b></div> : <section className="public-wiki-layout"><aside><small>INHALTSBEREICHE</small>{filtered.map((tab) => <button className={current?.id === tab.id ? "active" : ""} onClick={() => choose(tab.slug)} key={tab.id}><b>{tab.title}</b><span>{tab.summary}</span></button>)}{!filtered.length && <p>Keine passenden Inhalte gefunden.</p>}</aside><article>{current && <><span className="kicker">VTC TRUCK HUB WIKIPEDIA</span><h1>{current.title}</h1><p className="wiki-summary">{current.summary}</p><WikiBody body={current.body} /><footer>Zuletzt aktualisiert: {new Date(current.updatedAt).toLocaleString("de-DE")}</footer></>}</article></section>}
  </main>;
}

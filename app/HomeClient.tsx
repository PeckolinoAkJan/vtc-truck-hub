"use client";

import { useEffect, useMemo, useState } from "react";
import PublicNav from "./components/PublicNav";

type News = { id: string; slug: string; title: string; teaser: string; body: string; category: string; coverUrl?: string | null; pinned: number; publishedAt: string };
type Vtc = { driverCount: number; totalKm: number; country: string };

export default function HomeClient() {
  const [news, setNews] = useState<News[]>([]), [vtcs, setVtcs] = useState<Vtc[]>([]);
  useEffect(() => { Promise.all([
    fetch("/api/v1/public-content?type=news", { cache: "no-store" }).then((r) => r.ok ? r.json() : { data: [] }),
    fetch("/api/v1/vtcs?sort=recommended", { cache: "no-store" }).then((r) => r.ok ? r.json() : { data: [] }),
  ]).then(([n, v]) => { setNews(n.data ?? []); setVtcs(v.data ?? []); }).catch(() => undefined); }, []);
  const totals = useMemo(() => ({ drivers: vtcs.reduce((s, v) => s + Number(v.driverCount || 0), 0), km: vtcs.reduce((s, v) => s + Number(v.totalKm || 0), 0), countries: new Set(vtcs.map((v) => v.country).filter(Boolean)).size }), [vtcs]);
  const featured = news[0];
  return <main><PublicNav active="home" />
    <section className="hero home-hero" id="top"><div className="road-lines" />
      <div className="game-ribbon" aria-label="Unterstützte Spiele"><article className="ets-card"><span>EUROPE</span><strong>ETS2</strong><small>EURO TRUCK SIMULATOR 2</small></article><div className="game-ribbon-road"><i /><i /><i /></div><article className="ats-card"><span>AMERICA</span><strong>ATS</strong><small>AMERICAN TRUCK SIMULATOR</small></article></div>
      <div className="eyebrow"><span className="live-dot" /> DIE PLATTFORM FÜR VIRTUELLE SPEDITIONEN</div><h1>Gemeinsam fahren.<br /><span>Professionell verwalten.</span></h1><p>VTC Truck Hub verbindet Speditionen, Fahrer, Telemetrie, Aufträge, Fuhrpark und Abrechnung für ETS2 und ATS auf einer Plattform.</p>
      <div className="home-hero-actions"><a className="primary" href="/speditionen">Speditionen entdecken</a><a className="outline-light" href="/wiki">Plattform kennenlernen</a></div>
      <div className="hero-stats"><div><strong>{vtcs.length.toLocaleString("de-DE")}</strong><span>Speditionen</span></div><div><strong>{totals.drivers.toLocaleString("de-DE")}</strong><span>Fahrer</span></div><div><strong>{Math.round(totals.km).toLocaleString("de-DE")}</strong><span>Kilometer</span></div><div><strong>{totals.countries}</strong><span>Länder</span></div></div>
    </section>
    <section className="platform-news" id="news"><div className="section-head"><div><span className="kicker">AKTUELLES VOM VTC TRUCK HUB</span><h2>News & Ankündigungen</h2><p>Updates zur Plattform, zum Desktop-Client und zur Community.</p></div></div>
      {!featured ? <div className="public-empty"><b>Noch keine News veröffentlicht</b><span>Neue Meldungen erscheinen hier, sobald sie von der Plattform-Administration freigegeben wurden.</span></div> : <><article className="featured-news"><div className="news-cover" style={featured.coverUrl ? { backgroundImage: `linear-gradient(90deg,rgba(4,17,25,.92),rgba(4,17,25,.28)),url(${featured.coverUrl})` } : undefined}><span>{featured.pinned ? "ANGEHEFTET · " : ""}{featured.category}</span><h3>{featured.title}</h3><p>{featured.teaser}</p><small>{new Date(featured.publishedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}</small></div><div className="news-body">{featured.body.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</div></article>{news.length > 1 && <div className="news-grid">{news.slice(1).map((item) => <article key={item.id}><span>{item.category}</span><h3>{item.title}</h3><p>{item.teaser}</p><small>{new Date(item.publishedAt).toLocaleDateString("de-DE")}</small></article>)}</div>}</>}
    </section>
  </main>;
}

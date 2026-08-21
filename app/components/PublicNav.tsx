"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ActivePage = "home" | "companies" | "live" | "ranking" | "wiki";

export default function PublicNav({ active }: { active: ActivePage }) {
  const [account, setAccount] = useState({ signedIn: false, isFounder: false });
  const [client, setClient] = useState<{ version: string; downloadUrl: string } | null>(null);
  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => response.ok ? { signedIn: true, ...(await response.json()) } : { signedIn: false, isFounder: false }),
      fetch("/api/v1/client-download", { cache: "no-store" }).then(async (response) => response.ok ? (await response.json()).release ?? null : null),
    ]).then(([user, release]) => {
      setAccount({ signedIn: Boolean(user.signedIn), isFounder: Boolean(user.isFounder) });
      setClient(release);
    }).catch(() => undefined);
  }, []);
  return <header className="nav public-nav">
    <Link className="brand" href="/" aria-label="VTC Truck Hub Startseite"><span className="brand-mark">VH</span><span>VTC TRUCK <span>HUB</span></span></Link>
    <nav aria-label="Öffentliche Hauptnavigation">
      <Link className={active === "home" ? "active" : ""} href="/">Startseite</Link>
      <a className={active === "companies" ? "active" : ""} href="/speditionen">Speditionen</a>
      <a className={active === "live" ? "active" : ""} href="/live-map">Live-Map</a>
      <a className={active === "ranking" ? "active" : ""} href="/rangliste">Rangliste</a>
      <a className={active === "wiki" ? "active" : ""} href="/wiki">Wikipedia</a>
    </nav>
    <div className="nav-actions">
      {account.signedIn && client?.downloadUrl && <a className="client-download" href={client.downloadUrl} title={`VTC Truck Hub Client ${client.version}`}>Client herunterladen</a>}
      {account.isFounder && <a className="login" href="/admin">Administration</a>}
      {account.signedIn && <a className="login" href="/dashboard">Dashboard</a>}
      <a className="login" href="/konto">{account.signedIn ? "Mein Konto" : "Anmelden"}</a>
    </div>
  </header>;
}

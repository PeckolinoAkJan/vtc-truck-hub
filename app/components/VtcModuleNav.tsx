"use client";
import {useEffect,useState} from "react";

const sections=[["Übersicht","/dashboard"],["Fahrer","/verwaltung"],["Bewerbungen","/bewerbungen"],["Disposition","/disposition"],["Fahrtenbuch","/fahrtenbuch"],["Fuhrpark","/fuhrpark"],["Lohnbüro","/finanzen"],["Events","/events"],["Statistik","/statistik"]];
const enabled=["/dashboard","/verwaltung","/bewerbungen","/disposition","/fahrtenbuch","/fuhrpark","/finanzen","/abrechnung","/events","/statistik","/integrationen"];

export default function VtcModuleNav(){
  const [account,setAccount]=useState<any>(null),path=typeof location==="undefined"?"":location.pathname;
  useEffect(()=>{if(!enabled.some(x=>path===x||path.startsWith(`${x}/`)))return;fetch("/api/auth/me").then(r=>r.ok?r.json():null).then(setAccount).catch(()=>{})},[path]);
  if(!enabled.some(x=>path===x||path.startsWith(`${x}/`)))return null;
  const vtc=account?.memberships?.[0];
  return <aside className="module-hub-bar"><a className="module-hub-brand" href="/"><b>VH</b><span>VTC TRUCK HUB</span></a><div className="module-hub-vtc"><strong>{vtc?`${vtc.tag} · ${vtc.name}`:"Spedition wird geladen …"}</strong><small>{vtc?.roleName||"Mitgliederbereich"}</small></div><nav>{sections.map(([label,href])=><a key={href} className={path===href?"active":""} href={href}>{label}</a>)}</nav><div className="module-hub-actions">{vtc&&<a href={`/vtc/${vtc.slug}`}>Speditionsprofil</a>}<a className={path==="/integrationen"?"active key":"key"} href="/integrationen">API-Schlüssel</a><a href="/konto">Mein Konto</a></div></aside>;
}

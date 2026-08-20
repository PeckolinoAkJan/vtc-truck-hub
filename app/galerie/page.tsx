"use client";
import { useEffect, useState } from "react";
import ImageUploader from "../components/ImageUploader";
export default function Gallery() {
  const [items, setItems] = useState<any[]>([]),
    [vtcId, setVtcId] = useState("vtc-ngl"),
    [upload, setUpload] = useState<any>(),
    [moderation, setModeration] = useState<any[]>([]),
    [message, setMessage] = useState("");
  async function load() {
    const r = await fetch(`/api/v1/gallery?vtcId=${encodeURIComponent(vtcId)}`),
      j = await r.json();
    setItems(j.items || []);
    const mr = await fetch(`/api/v1/gallery?vtcId=${encodeURIComponent(vtcId)}&moderation=true`);
    if (mr.ok) {
      const mj = await mr.json();
      setModeration((mj.items || []).filter((x:any) => x.status === "pending"));
    } else setModeration([]);
  }
  async function moderate(id:string,status:"approved"|"rejected"){
    const r=await fetch("/api/v1/gallery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"moderate",vtcId,id,status})});
    const j=await r.json();setMessage(r.ok?(status==="approved"?"Bild freigegeben.":"Bild abgelehnt."):j.error);if(r.ok)load();
  }
  useEffect(() => {
    load();
  }, [vtcId]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!upload) return setMessage("Bitte zuerst ein Bild hochladen.");
    const f = Object.fromEntries(new FormData(e.currentTarget)),
      r = await fetch("/api/v1/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          vtcId,
          uploadId: upload.id,
          ...f,
        }),
      }),
      j = await r.json();
    setMessage(
      r.ok
        ? j.status === "pending"
          ? "Bild wartet auf Freigabe."
          : "Bild wurde veröffentlicht."
        : j.error,
    );
    if (r.ok) {
      setUpload(null);
      load();
    }
  }
  return (
    <main className="workspace-page">
      <header className="workspace-head">
        <div>
          <span className="kicker">MEDIENBEREICH</span>
          <h1>Speditionsgalerie</h1>
          <p>
            Öffentliche, moderierte Bilder für Events, Fahrzeuge und Fahrten.
          </p>
        </div>
        <nav>
          <a href="/verwaltung/bilder">Logo & Header</a>
          <a href="/dashboard">Dashboard</a>
        </nav>
      </header>
      <section className="manage-panel">
        <label>
          Spedition
          <input value={vtcId} onChange={(e) => setVtcId(e.target.value)} />
        </label>
        <form className="manage-form" onSubmit={save}>
          <ImageUploader
            purpose="gallery"
            vtcId={vtcId}
            label="Neues Galeriebild"
            onUploaded={setUpload}
          />
          <label>
            Bildbeschreibung
            <textarea name="caption" required />
          </label>
          <label>
            Tags, mit Komma getrennt
            <input name="tags" placeholder="Convoy, Scania, Hamburg" />
          </label>
          <label>
            Sichtbarkeit
            <select name="visibility">
              <option value="public">Öffentlich</option>
              <option value="internal">Nur intern</option>
            </select>
          </label>
          <button className="primary">In Galerie einstellen</button>
          {message && <p>{message}</p>}
        </form>
      </section>
      {moderation.length > 0 && <section className="manage-panel gallery-moderation"><h2>Wartet auf Freigabe</h2><div className="media-grid">{moderation.map(x=><article key={x.id}><img src={x.url} alt="Zu prüfendes Bild"/><div><b>{x.caption||x.filename}</b><small>{x.ownerName}</small><div><button onClick={()=>moderate(x.id,"approved")}>Freigeben</button><button onClick={()=>moderate(x.id,"rejected")}>Ablehnen</button></div></div></article>)}</div></section>}
      <section className="media-grid">
        {items.map((x) => (
          <article key={x.id}>
            <img src={x.url} alt={x.caption || x.filename} />
            <div>
              <b>{x.caption || x.filename}</b>
              <small>
                {x.ownerName} ·{" "}
                {new Date(x.created_at).toLocaleDateString("de-DE")}
              </small>
              <p>{x.tags?.join(" · ")}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

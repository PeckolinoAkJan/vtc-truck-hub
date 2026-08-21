"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type NewsItem = { id?: string; title?: string; slug?: string; teaser?: string; body?: string; category?: string; coverUrl?: string; status?: string; pinned?: number; publishAt?: string };
type WikiItem = { id?: string; title?: string; slug?: string; summary?: string; body?: string; position?: number; status?: string };
type Content = { news: NewsItem[]; wiki: WikiItem[] };
type EditorItem = NewsItem | WikiItem;
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

export default function FounderContent({ mode }: { mode: "Startseite & News" | "Wikipedia" }) {
  const [data, setData] = useState<Content>({ news: [], wiki: [] });
  const [selected, setSelected] = useState<EditorItem | null>(null);
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch("/api/admin/content", { cache: "no-store" }).then(async (response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result as Content);
  }), []);
  useEffect(() => { load().catch((reason) => setError(errorText(reason))); }, [load]);

  async function act(body: object, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(success); setSelected(null); await load();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  async function upload(file: File) {
    const response = await fetch("/api/v1/uploads?purpose=platform_image", { method: "POST", headers: { "Content-Type": file.type, "X-Filename": file.name }, body: file });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return String(result.upload.url);
  }

  if (mode === "Startseite & News") {
    const item = (selected ?? {}) as NewsItem;
    return <div className="content-admin">
      <section className="admin-list"><div className="content-admin-head"><div><h2>Öffentliche News</h2><p>Nur veröffentlichte Meldungen erscheinen auf der Startseite.</p></div><button onClick={() => setSelected({ status: "draft", category: "Plattform", pinned: 0 })}>+ Neue News</button></div>
        {data.news.map((news) => <article key={news.id}><div><strong>{news.title}</strong><span>{news.category} · {news.status} {news.pinned ? "· angeheftet" : ""}</span></div><button onClick={() => setSelected(news)}>Bearbeiten</button><button className="danger" onClick={() => act({ action: "archiveNews", id: news.id }, "News archiviert.")}>Archivieren</button></article>)}
        {!data.news.length && <p>Noch keine News angelegt.</p>}
      </section>
      {selected && <form className="admin-form content-editor" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); const values = new FormData(event.currentTarget), file = values.get("coverFile") as File; let coverUrl = String(values.get("coverUrl") || "");
        try { if (file?.size) coverUrl = await upload(file); } catch (reason) { setError(errorText(reason)); return; }
        await act({ action: "saveNews", id: item.id, data: { ...Object.fromEntries(values), coverUrl, pinned: values.get("pinned") === "on" } }, "News gespeichert.");
      }}><h2>{item.id ? "News bearbeiten" : "News erstellen"}</h2><div className="admin-grid"><label>Titel<input name="title" defaultValue={item.title || ""} required /></label><label>Kurzadresse<input name="slug" defaultValue={item.slug || ""} placeholder="wird aus dem Titel erzeugt" /></label><label>Kategorie<input name="category" defaultValue={item.category || "Plattform"} /></label><label>Status<select name="status" defaultValue={item.status || "draft"}><option value="draft">Entwurf</option><option value="published">Veröffentlicht</option><option value="archived">Archiviert</option></select></label><label>Veröffentlichung planen<input name="publishAt" type="datetime-local" defaultValue={item.publishAt?.slice(0, 16) || ""} /></label><label><span>Anheften</span><input name="pinned" type="checkbox" defaultChecked={Boolean(item.pinned)} /></label></div><label>Kurzbeschreibung<textarea name="teaser" defaultValue={item.teaser || ""} maxLength={500} /></label><label>Vollständige Meldung<textarea name="body" className="large-editor" defaultValue={item.body || ""} required /></label><label>Titelbild hochladen<input name="coverFile" type="file" accept="image/png,image/jpeg,image/webp" /></label><label>oder vorhandene HTTPS-Bildadresse<input name="coverUrl" defaultValue={item.coverUrl || ""} /></label><div className="editor-actions"><button className="primary" disabled={busy}>Speichern</button><button type="button" onClick={() => setSelected(null)}>Abbrechen</button></div></form>}
      {error && <p className="admin-error">{error}</p>}{message && <p className="admin-success">{message}</p>}
    </div>;
  }

  const item = (selected ?? {}) as WikiItem;
  return <div className="content-admin"><section className="admin-list"><div className="content-admin-head"><div><h2>Wikipedia-Reiter</h2><p>Reihenfolge, Inhalte und Veröffentlichung der öffentlichen Wissensbereiche.</p></div><button onClick={() => setSelected({ status: "draft", position: (data.wiki.length + 1) * 10 })}>+ Reiter hinzufügen</button></div>{data.wiki.map((wiki) => <article key={wiki.id}><div><strong>{wiki.position}. {wiki.title}</strong><span>/{wiki.slug} · {wiki.status}</span></div><button onClick={() => setSelected(wiki)}>Bearbeiten</button><button className="danger" onClick={() => act({ action: "archiveWiki", id: wiki.id }, "Wiki-Reiter archiviert.")}>Archivieren</button></article>)}</section>
    {selected && <form className="admin-form content-editor" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); act({ action: "saveWiki", id: item.id, data: Object.fromEntries(values) }, "Wikipedia gespeichert."); }}><h2>{item.id ? "Wiki-Reiter bearbeiten" : "Wiki-Reiter erstellen"}</h2><div className="admin-grid"><label>Titel<input name="title" defaultValue={item.title || ""} required /></label><label>Kurzadresse<input name="slug" defaultValue={item.slug || ""} placeholder="wird aus dem Titel erzeugt" /></label><label>Reihenfolge<input name="position" type="number" min="0" defaultValue={item.position || 0} /></label><label>Status<select name="status" defaultValue={item.status || "draft"}><option value="draft">Entwurf</option><option value="published">Veröffentlicht</option><option value="archived">Archiviert</option></select></label></div><label>Kurzbeschreibung<textarea name="summary" defaultValue={item.summary || ""} /></label><label>Inhalt<textarea name="body" className="large-editor" defaultValue={item.body || ""} placeholder="## Überschrift" required /></label><div className="editor-actions"><button className="primary" disabled={busy}>Speichern</button><button type="button" onClick={() => setSelected(null)}>Abbrechen</button></div></form>}
    {error && <p className="admin-error">{error}</p>}{message && <p className="admin-success">{message}</p>}
  </div>;
}

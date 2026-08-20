"use client";
import { useEffect, useState } from "react";
import ImageUploader from "../../components/ImageUploader";
export default function CompanyImages() {
  const [data, setData] = useState<any>(),
    [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/v1/management?vtcId=vtc-ngl")
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          location.href = "/konto";
          return null;
        }
        return r.json();
      })
      .then(setData);
  }, []);
  if (!data)
    return (
      <main className="manage-loading">Bildverwaltung wird geladen …</main>
    );
  const p = data.profile || {};
  return (
    <main className="manage-page">
      <header>
        <a className="brand" href="/">
          <span className="brand-mark">CH</span>
          <span>
            CONVOY<span>HUB</span>
          </span>
        </a>
        <div>
          <span className="kicker">{data.vtc.tag}</span>
          <h1>Logo & Titelbild</h1>
        </div>
        <a href="/verwaltung">Zur Verwaltung</a>
      </header>
      <section className="manage-panel wide">
        <h2>Öffentliche Markenbilder</h2>
        <p>
          Logo und Header erscheinen nach dem Upload sofort im Verzeichnis und
          auf der öffentlichen Speditionsseite.
        </p>
        <div className="company-image-settings">
          <ImageUploader
            purpose="company_logo"
            vtcId={data.vtc.id}
            label="Speditionslogo"
            current={
              p.logo_upload_id ? `/api/v1/uploads?id=${p.logo_upload_id}` : null
            }
            onUploaded={() => setMessage("Logo gespeichert.")}
          />
          <ImageUploader
            purpose="company_header"
            vtcId={data.vtc.id}
            label="Titelbild / animierter Header"
            current={
              p.header_upload_id
                ? `/api/v1/uploads?id=${p.header_upload_id}`
                : null
            }
            onUploaded={() => setMessage("Header gespeichert.")}
          />
        </div>
        {message && <p className="manage-message">{message}</p>}
        <div className="image-guidance">
          <h3>Empfohlene Größen</h3>
          <p>
            Logo: quadratisch, mindestens 512 × 512 Pixel. Header: 1920 × 640
            Pixel. WebP spart Speicher und lädt besonders schnell.
          </p>
          <a className="primary" href={`/vtc/${data.vtc.slug}`}>
            Öffentliche Seite prüfen →
          </a>
        </div>
      </section>
    </main>
  );
}

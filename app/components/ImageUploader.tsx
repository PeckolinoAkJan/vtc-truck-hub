"use client";
import { useRef, useState } from "react";

export default function ImageUploader({
  purpose,
  vtcId,
  label,
  current,
  onUploaded,
}: {
  purpose: "avatar" | "company_logo" | "company_header" | "gallery" | "discord_image";
  vtcId?: string;
  label: string;
  current?: string | null;
  onUploaded?: (upload: { id: string; url: string; status: string }) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    [preview, setPreview] = useState(current || ""),
    [message, setMessage] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setMessage("Bild wird sicher geprüft und hochgeladen …");
    const local = URL.createObjectURL(file);
    setPreview(local);
    const params = new URLSearchParams({ purpose });
    if (vtcId) params.set("vtcId", vtcId);
    const r = await fetch(`/api/v1/uploads?${params}`, {
        method: "POST",
        headers: { "Content-Type": file.type, "X-Filename": file.name },
        body: file,
      }),
      j = await r.json();
    if (!r.ok) {
      setMessage(j.error || "Upload fehlgeschlagen");
      return;
    }
    setPreview(j.upload.url);
    setMessage(
      j.upload.status === "pending"
        ? "Hochgeladen – wartet auf Freigabe."
        : "Bild ist gespeichert und sofort sichtbar.",
    );
    onUploaded?.(j.upload);
  }
  return (
    <div
      className={
        purpose === "company_header"
          ? "image-uploader header-upload"
          : "image-uploader"
      }
    >
      {preview ? (
        <img src={preview} alt="" className="upload-preview" />
      ) : (
        <div className="upload-placeholder">Noch kein Bild</div>
      )}
      <div>
        <strong>{label}</strong>
        <small>
          JPG, PNG oder WebP ·{" "}
          {purpose === "avatar" || purpose === "company_logo"
            ? "max. 5 MB"
            : "max. 12 MB"}
        </small>
        <button type="button" onClick={() => input.current?.click()}>
          Bild auswählen
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => upload(e.target.files?.[0])}
        />
        {message && <span className="upload-message">{message}</span>}
      </div>
    </div>
  );
}

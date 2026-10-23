"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { withOperationTimeout } from "../../lib/nexride-operation";

/** Object URLs stay on the device; saved evidence uses short-lived signed access. */
export function DriverDocumentPreview({ file, path, label }: { file: File | null; path: string; label: string }) {
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setPreview("");
      setError("Choose a JPG, PNG, WebP or PDF file no larger than 8 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const openSaved = async () => {
    if (busy || !path) return;
    // Open synchronously to preserve the mobile browser's user gesture.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError("");
    try {
      const { data, error: signedError } = await withOperationTimeout(supabase.storage
        .from("driver-verification").createSignedUrl(path, 60));
      if (signedError || !data?.signedUrl) throw new Error("preview_unavailable");
      if (tab) tab.location.href = data.signedUrl;
      else { setPreview(data.signedUrl); setError("Open the preview link below. It expires after one minute."); }
    } catch {
      tab?.close();
      setError("The private document could not be opened. Check your connection and retry.");
    } finally { setBusy(false); }
  };
  if (!file && !path) return null;
  return <div className="biloo-document-preview">
    {file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</small>}
    {preview && file?.type.startsWith("image/") && <img src={preview} alt={label + " preview"} />}
    {preview && <a href={preview} target="_blank" rel="noreferrer">Open {label.toLowerCase()} preview</a>}
    {!file && path && <button type="button" onClick={() => void openSaved()} disabled={busy}>{busy ? "Opening private document…" : "View saved " + label.toLowerCase()}</button>}
    {error && <p role="status">{error}</p>}
  </div>;
}

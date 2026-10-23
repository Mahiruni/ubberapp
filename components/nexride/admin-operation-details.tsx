"use client";
import { useEffect, useRef, useState } from "react";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import { withOperationTimeout } from "../../lib/nexride-operation";
import "./admin-operations.css";

type RecordRow = Record<string, unknown>;
type Details = { record: RecordRow; sections: { title: string; rows: RecordRow[]; unavailable: boolean }[]; note: string };
const label = (value: string) => value.replaceAll("_", " ").replace(/\betb\b/g, "ETB");
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
export function AdminOperationDetails({ id = "", kind }: { id?: string; kind: "driver" | "ride" | "finance" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const controller = new AbortController();
    let active = true;
    setDetails(null);
    setError("");
    void withOperationTimeout(nexrideApiFetch(`/api/admin/operations?kind=${kind}&id=${encodeURIComponent(id)}`,
      { signal: controller.signal, cache: "no-store" }), 20_000).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json();
      if (active) setDetails(payload);
    }).catch(() => { if (active) setError("Records could not be loaded. Check your connection and retry."); });
    return () => { active = false; controller.abort(); };
  }, [open, attempt, id, kind]);
  return <>
    <button type="button" onClick={() => setOpen(true)}>{kind === "finance" ? "Financial oversight" : kind === "driver" ? "Inspect application" : "Inspect ride"}</button>
    <dialog ref={dialog} className="biloo-operation-dialog" onClose={() => setOpen(false)}>
      <header><div><small>BILOO · OPERATIONS</small><h2>{kind === "finance" ? "Financial oversight" : kind === "driver" ? "Driver application" : "Ride investigation"}</h2></div><button type="button" aria-label="Close investigation" onClick={() => dialog.current?.close()}>×</button></header>
      <div className="biloo-operation-body">
        {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>
          : !details ? <p role="status">Loading saved records…</p> : <>
            <dl className="biloo-operation-summary">{Object.entries(details.record).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{display(value)}</dd></div>)}</dl>
            {details.sections.map(section => <section key={section.title} className="biloo-operation-section"><h3>{section.title}</h3>
              {section.unavailable ? <p role="status">This section is temporarily unavailable. Refresh to retry.</p> : !section.rows.length ? <p>No saved records.</p> : <div className="biloo-operation-table"><table><thead><tr>{Object.keys(section.rows[0]).map(key => <th key={key}>{label(key)}</th>)}</tr></thead><tbody>{section.rows.map((row, index) => <tr key={String(row.id || index)}>{Object.entries(row).map(([key, value]) => <td key={key}>{display(value)}</td>)}</tr>)}</tbody></table></div>}
            </section>)}
            <p className="biloo-operation-note">{details.note}</p>
            <button type="button" onClick={() => setAttempt(value => value + 1)}>Refresh records</button>
          </>}
      </div>
    </dialog>
  </>;
}

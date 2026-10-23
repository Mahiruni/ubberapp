"use client";
import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { withOperationTimeout } from "../../lib/nexride-operation";
import "./admin-operations.css";

type Decision = "approved" | "rejected" | "suspended" | "pending";
const names: Record<Decision, string> = { approved: "Approve driver", rejected: "Request corrections / reject", suspended: "Suspend driving access", pending: "Reopen application review" };
export function AdminDriverReview({ id, status, onChanged }: { id: string; status: string; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [decision, setDecision] = useState<Decision>("approved");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const choose = (next: Decision) => { setDecision(next); setReason(""); setMessage(""); dialog.current?.showModal(); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await withOperationTimeout(supabase.rpc("admin_review_driver_application", {
        p_driver_id: id, p_status: decision, p_reason: reason.trim(),
      }));
      if (error) {
        setMessage(/documents_incomplete|licence_expired|profile_incomplete/.test(error.message)
          ? "Approval requires a complete active profile, vehicle details and current private documents."
          : /active_trip/.test(error.message) ? "This driver has an active trip. Resolve it before changing access."
            : "The decision could not be confirmed. Refresh the records and try again.");
        return;
      }
      dialog.current?.close();
      onChanged();
    } catch { setMessage("Your decision could not be confirmed. Refresh before retrying; the audit history shows saved decisions."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <>
    {status === "pending" && <><button type="button" onClick={() => choose("approved")}>Approve</button><button type="button" onClick={() => choose("rejected")}>Request corrections / reject</button></>}
    {status === "approved" && <button type="button" onClick={() => choose("suspended")}>Suspend</button>}
    {(status === "suspended" || status === "rejected") && <button type="button" onClick={() => choose("pending")}>Reopen review</button>}
    <dialog ref={dialog} className="biloo-operation-dialog biloo-review-dialog" onCancel={event => { if (busy) event.preventDefault(); }}>
      <header><div><small>BILOO · DRIVER VERIFICATION</small><h2>{names[decision]}</h2></div><button type="button" aria-label="Close driver review" disabled={busy} onClick={() => dialog.current?.close()}>×</button></header>
      <form className="biloo-operation-body" onSubmit={submit}>
        <p>This changes the driver’s saved access status and creates an audit record. Approval checks the current vehicle and document evidence.</p>
        <label>Review note {decision === "approved" ? "(optional)" : "(required)"}<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} minLength={decision === "approved" ? 0 : 5} required={decision !== "approved"} rows={4} /></label>
        {message && <p role="alert">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? "Saving decision…" : "Confirm decision"}</button>
      </form>
    </dialog>
  </>;
}

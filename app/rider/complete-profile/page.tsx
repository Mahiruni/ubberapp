"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EntryShell } from "../../../components/nexride/entry";
import { Button, Icon } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { enterRider, ACTIVE_ACCOUNT_ROLE_KEY, clearExplicitSignOut } from "../../../lib/nexride-startup";
import { ensureRiderProfile, RiderProfileBootstrapError } from "../../../lib/nexride-rider-profile-bootstrap";
import { normalizeEthiopianPhone } from "../../../lib/nexride-identity";
import "../../../app/nexride.css";
import "../rider-entry.css";
import "../../../app/auth-experience.css";
import "../../../app/detail-system.css";

export default function CompleteRiderProfile() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (!data.session) {
        router.replace("/rider/sign-in");
        return;
      }
      setEmail(data.session.user.email || "");
      const { data: profile } = await supabase.from("profiles")
        .select("full_name,phone,role").eq("id", data.session.user.id).maybeSingle();
      if (!active) return;
      if (profile?.role === "admin") {
        router.replace("/admin");
        return;
      }
      setName(profile?.full_name || String(data.session.user.user_metadata?.full_name || ""));
      setPhone(profile?.phone || String(data.session.user.user_metadata?.phone || ""));
      setLoading(false);
    }).catch(() => { if (active) setError("We couldn't restore your NexRide session."); });
    return () => { active = false; };
  }, [router]);

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const fullName = name.trim();
    const normalizedPhone = normalizeEthiopianPhone(phone);
    if (fullName.length < 2 || fullName.length > 80 || !normalizedPhone) {
      setError("Enter your full name and a valid Ethiopian phone number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/rider/sign-in");
        return;
      }
      await ensureRiderProfile(data.session, { fullName, phone: normalizedPhone });
      window.localStorage.setItem(ACTIVE_ACCOUNT_ROLE_KEY, "rider");
      clearExplicitSignOut();
      enterRider(data.session);
      router.replace("/");
    } catch (cause) {
      if (cause instanceof RiderProfileBootstrapError &&
        cause.code === "email_not_verified") {
        setError("Verify your NexRide email before completing your Rider account.");
      } else {
        setError("Your Rider profile could not be completed. Review your details and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return <EntryShell authMode="signup">
    <section className="nr-rider-welcome nr-rider-onboarding-resume" aria-label="Complete Rider profile">
      <span className="nr-rider-entry-kicker"><Icon name="shield" size={16}/> NEXRIDE · ONE ACCOUNT</span>
      <h1>Complete Your Rider Profile</h1>
      <p>Your NexRide login is already secured. Add only the details missing for Rider access.</p>
      {loading ? <p role="status">Restoring your profile…</p> : <form className="nr-profile-form" onSubmit={complete}>
        <label className="nr-input-field"><span>Verified account email</span>
          <input type="email" value={email} readOnly aria-readonly="true" /></label>
        <label className="nr-input-field"><span>Full name</span>
          <input value={name} onChange={event => setName(event.target.value)}
            autoComplete="name" minLength={2} maxLength={80} required /></label>
        <label className="nr-input-field"><span>Mobile number</span>
          <input value={phone} onChange={event => setPhone(event.target.value)}
            autoComplete="tel" inputMode="tel" required /></label>
        {error && <p className="nr-auth-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy} loading={busy}>Continue to Rider <Icon name="arrow" size={18}/></Button>
        <Link className="nr-auth-role-link" href="/driver/home">Return to Driver</Link>
      </form>}
    </section>
  </EntryShell>;
}

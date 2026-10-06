"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Brand, Icon } from "../../../components/nexride/ui";
import { VehicleIllustration } from "../../../components/nexride/vehicle";
import { supabase } from "../../../lib/supabase";
import { enterDriver } from "../../../lib/nexride-startup";
import { driverResumeDestination } from "../../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import "../driver-welcome.css";
import "./driver-auth.css";

export default function DriverAuth() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("confirmed") === "1") {
      setNotice("Email confirmed. Opening your Driver account…");
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      const role = await resolveSessionRole(data.session);
      if (!active) return;
      if (role === "admin") {
        router.replace("/admin");
        return;
      }
      if (role !== "driver") {
        router.replace("/");
        return;
      }
      enterDriver(data.session);
      const destination = await driverResumeDestination(data.session);
      if (active) router.replace(destination);
    });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.session) {
      setError(authError?.message || "Unable to sign in.");
      setBusy(false);
      return;
    }

    const role = await resolveSessionRole(data.session);
    if (role === "admin") {
      router.replace("/admin");
      return;
    }
    if (role !== "driver") {
      router.replace("/");
      return;
    }

    enterDriver(data.session);
    const destination = await driverResumeDestination(data.session);
    router.replace(destination);
  }

  return (
    <main className="nr-auth-experience driver-auth-page">
      <div className="nr-auth-page">
        <section className="nr-auth-shell nr-auth-shell-driver">
          <div className="nr-auth-hero" aria-hidden="true">
            <Image src="/images/addis-splash-city.jpg" alt="" fill priority sizes="(max-width: 760px) 100vw, 760px" quality={86} />
            <div className="nr-auth-hero-wash driver" />
            <div className="nr-auth-hero-top">
              <Brand />
              <span className="nr-auth-role-tab">Driver</span>
            </div>
            <div className="nr-auth-hero-copy">
              <span>NEXRIDE · DRIVER</span>
              <strong>Drive. Earn.<br />Grow.</strong>
            </div>
            <div className="nr-auth-hero-vehicle driver"><VehicleIllustration category="comfort" /></div>
          </div>

          <div className="nr-auth-content">
            <Link href="/driver" className="nr-auth-back">← Driver home</Link>
            <span className="driver-auth-role">DRIVER ACCOUNT</span>
            <h1>Driver Sign In</h1>
            <p>Welcome back. Go online and start earning.</p>

            <form onSubmit={submit} className="nr-auth-form">
              <label><span>Email address</span><div className="nr-auth-input"><Icon name="user" size={19}/><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="Email address" required /></div></label>
              <label><span>Password</span><div className="nr-auth-input"><Icon name="shield" size={19}/><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Password" required /></div></label>
              {error && <div className="driver-auth-error" role="alert">{error}</div>}
              {notice && <div className="driver-auth-notice" role="status">{notice}</div>}
              <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign In →"}</button>
            </form>

            <div className="nr-auth-divider"><span>or</span></div>
            <Link className="nr-auth-create-link" href="/driver/onboarding"><Icon name="plus" size={18}/>Create Driver Account</Link>
            <div className="nr-auth-role-note">
              <span><Icon name="car" size={20}/></span>
              <div><strong>This sign in is for Drivers</strong><small>Accept trips, manage documents, and earn with NexRide.</small></div>
            </div>
            <Link className="nr-auth-role-link" href="/rider/sign-in">Need a ride instead? <strong>Switch to Rider →</strong></Link>
          </div>
        </section>
      </div>
    </main>
  );
}

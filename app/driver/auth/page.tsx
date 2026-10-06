"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "../../../components/nexride/ui";
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
    <main className="driver-auth-page">
      <section className="driver-auth-card">
        <Link href="/driver" className="driver-auth-back">← Back</Link>
        <Brand driver />
        <span className="driver-auth-role">DRIVER ACCOUNT</span>
        <h1>Welcome back.</h1>
        <p>Sign in to your NexRide driver account and continue where you left off.</p>

        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="driver-auth-error" role="alert">{error}</div>}
          {notice && <div className="driver-auth-notice" role="status">{notice}</div>}
          <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in as Driver"}</button>
        </form>

        <p className="driver-auth-footer">New to NexRide? <Link href="/driver/onboarding">Create a driver account</Link></p>
      </section>
    </main>
  );
}

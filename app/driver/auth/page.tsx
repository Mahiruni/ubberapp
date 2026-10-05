"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { enterDriver } from "../../../lib/nexride-startup";
import { driverResumeDestination } from "../../../lib/nexride-driver-verification";
import "../driver-welcome.css";
import "./driver-auth.css";

export default function DriverAuth() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      if (data.session.user.user_metadata?.role === "driver") {
        enterDriver(data.session);
        const destination = await driverResumeDestination(data.session);
        if (active) router.replace(destination);
      }
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

    if (data.session.user.user_metadata?.role !== "driver") {
      await supabase.auth.signOut();
      setError("This account is registered as a rider. Please use the driver registration flow.");
      setBusy(false);
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
          <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in as Driver"}</button>
        </form>

        <p className="driver-auth-footer">New to NexRide? <Link href="/driver/onboarding">Create a driver account</Link></p>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { nexrideAuthRedirectUrl } from "../../../lib/nexride-auth-url";
import "../auth/driver-auth.css";
import "./driver-onboarding.css";

export default function DriverOnboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session) return;
      if (data.session.user.user_metadata?.role !== "driver") return;
      if (data.session.user.user_metadata?.driver_onboarding_complete === true) {
        router.replace("/driver/verification");
      }
    });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");

    const { data: sessionData } = await supabase.auth.getSession();
    const existing = sessionData.session;

    if (existing && existing.user.user_metadata?.role === "driver") {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          role: "driver",
          full_name: name.trim(),
          phone: phone.trim(),
          vehicle: vehicle.trim(),
          vehicle_plate: plate.trim(),
          driver_onboarding_complete: true,
        },
      });

      if (updateError) {
        setError(updateError.message || "Unable to save driver profile.");
        setBusy(false);
        return;
      }

      await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() }).eq("id", existing.user.id);
      router.replace("/driver/verification");
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: nexrideAuthRedirectUrl("/driver/auth?confirmed=1"),
        data: {
          role: "driver",
          full_name: name.trim(),
          phone: phone.trim(),
          vehicle: vehicle.trim(),
          vehicle_plate: plate.trim(),
          driver_onboarding_complete: true,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      router.replace("/driver/verification");
      return;
    }

    setNotice("Your driver account was created. Confirm your email, then sign in to continue verification.");
    setBusy(false);
  }

  return (
    <main className="driver-onboarding-page">
      <section className="driver-onboarding-card">
        <Link href="/driver" className="driver-auth-back">← Back</Link>
        <Brand driver />
        <span className="driver-auth-role">DRIVER ONBOARDING · STEP 1 OF 2</span>
        <h1>Start driving.</h1>
        <p>Create your driver account and add the basic vehicle details NexRide needs before verification.</p>

        <form onSubmit={submit}>
          <div className="driver-form-grid">
            <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>
            <label>Phone number<input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required /></label>
          </div>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required /></label>
          <div className="driver-form-grid">
            <label>Vehicle<input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Toyota Corolla" required /></label>
            <label>Plate number<input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="2-A12345" required /></label>
          </div>
          {error && <div className="driver-auth-error" role="alert">{error}</div>}
          {notice && <div className="driver-auth-notice" role="status">{notice}<Link href="/driver/auth">Sign in as Driver</Link></div>}
          <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? "Creating account…" : "Continue to Verification"}</button>
        </form>

        <p className="driver-auth-footer">Already registered? <Link href="/driver/auth">Sign in as Driver</Link></p>
      </section>
    </main>
  );
}

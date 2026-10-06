"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Brand, Icon } from "../../../components/nexride/ui";
import { VehicleIllustration } from "../../../components/nexride/vehicle";
import { supabase } from "../../../lib/supabase";
import { nexrideAuthRedirectUrl } from "../../../lib/nexride-auth-url";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import "../auth/driver-auth.css";
import "./driver-onboarding.css";
import "../../auth-experience.css";

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
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      const role = await resolveSessionRole(data.session).catch(() => "");
      if (!active) return;
      if (role === "admin") {
        router.replace("/admin");
        return;
      }
      if (role !== "driver") return;
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
    const existingRole = existing ? await resolveSessionRole(existing).catch(() => "") : "";

    if (existing && existingRole === "driver") {
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
    <main className="nr-auth-experience driver-onboarding-page">
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
              <strong>Drive Addis.<br />Build your day.</strong>
            </div>
            <div className="nr-auth-hero-vehicle driver"><VehicleIllustration category="xl" /></div>
          </div>

          <div className="nr-auth-content">
            <Link href="/driver" className="nr-auth-back">← Driver home</Link>
            <span className="driver-auth-role">DRIVER ACCOUNT</span>
            <h1>Create Driver Account</h1>
            <p>Sign up to drive, complete verification, and earn with NexRide.</p>

            <form onSubmit={submit} className="nr-auth-form">
              <div className="driver-form-grid">
                <label><span>Full name</span><div className="nr-auth-input"><Icon name="user" size={19}/><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Full name" required /></div></label>
                <label><span>Phone number</span><div className="nr-auth-input"><Icon name="phone" size={19}/><input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+251…" required /></div></label>
              </div>
              <label><span>Email address</span><div className="nr-auth-input"><Icon name="user" size={19}/><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="Email address" required /></div></label>
              <label><span>Password</span><div className="nr-auth-input"><Icon name="shield" size={19}/><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} placeholder="Password" required /></div></label>

              <div className="nr-auth-subsection">
                <div><span>VEHICLE DETAILS</span><small>Used during Driver verification.</small></div>
                <div className="driver-form-grid">
                  <label><span>Vehicle</span><div className="nr-auth-input"><Icon name="car" size={19}/><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Toyota Corolla" required /></div></label>
                  <label><span>Plate number</span><div className="nr-auth-input"><Icon name="card" size={19}/><input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="2-A12345" required /></div></label>
                </div>
              </div>

              {error && <div className="driver-auth-error" role="alert">{error}</div>}
              {notice && <div className="driver-auth-notice" role="status">{notice}<Link href="/driver/auth">Sign in as Driver</Link></div>}
              <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create Account →"}</button>
            </form>

            <div className="nr-auth-divider"><span>or</span></div>
            <Link className="nr-auth-create-link" href="/driver/auth">Already have an account? <strong>Sign In</strong></Link>
            <div className="nr-auth-role-note">
              <span><Icon name="car" size={20}/></span>
              <div><strong>This account is for Drivers</strong><small>Submit documents, manage trips, and start earning.</small></div>
            </div>
            <Link className="nr-auth-role-link" href="/rider/sign-in">Need to ride instead? <strong>Switch to Rider →</strong></Link>
          </div>
        </section>
      </div>
    </main>
  );
}

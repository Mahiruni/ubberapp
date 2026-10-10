"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import "../../../app/nexride.css";

type Purpose = "signup" | "recovery";
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export default function EmailVerification() {
  const router = useRouter();
  const [purpose, setPurpose] = useState<Purpose>("signup");
  const [returnRole, setReturnRole] = useState<"rider" | "driver">("rider");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSent, setLastSent] = useState(0);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("nexride:verification-target");
      if (!raw) return;
      const target = JSON.parse(raw) as { email?: string; role?: string; purpose?: string };
      if (target.email && validEmail(target.email)) setEmail(target.email);
      if (target.role === "driver") setReturnRole("driver");
      if (target.purpose === "recovery") setPurpose("recovery");
    } catch { /* The verification screen remains usable without saved form context. */ }
  }, []);
  useEffect(() => {
    if (!lastSent) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lastSent]);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !validEmail(email) || !/^\d{6}$/.test(code)) { setError("Enter your email and the six-digit code."); return; }
    setBusy(true); setError("");
    try {
      const result = await supabase.auth.verifyOtp({email: email.trim().toLowerCase(), token: code, type: purpose === "signup" ? "signup" : "recovery"});
      if (result.error) { setError("The code is invalid or expired. Request a new code if necessary."); return; }
      try { window.sessionStorage.removeItem("nexride:verification-target"); } catch { /* Storage is optional. */ }
      if (purpose === "recovery") { setVerified(true); setMessage("Email confirmed. Choose a new password."); }
      else { setMessage("Email verified successfully."); router.replace(returnRole === "driver" ? "/driver/auth?confirmed=1" : "/rider/sign-in?confirmed=1"); }
    } catch { setError("Verification could not be completed. Check your connection."); }
    finally { setBusy(false); }
  }
  async function resend() {
    if (busy || !validEmail(email) || Date.now() - lastSent < 60000) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = purpose === "signup"
        ? await supabase.auth.resend({type:"signup",email:email.trim().toLowerCase(),options:{emailRedirectTo:window.location.origin+(returnRole === "driver" ? "/driver/auth?confirmed=1" : "/rider/sign-in?confirmed=1")}})
        : await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:window.location.origin+"/rider/reset-password"});
      if (result.error) { setError("Unable to send an email right now. Please wait before trying again."); return; }
      setLastSent(Date.now());
      setMessage("If eligible, a verification email has been sent. Check your inbox and spam folder.");
    } catch { setError("Unable to send an email right now."); }
    finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verified || busy) return;
    if (password.length < 12 || password !== confirm) { setError("Use at least 12 characters and matching passwords."); return; }
    setBusy(true); setError("");
    try {
      const result = await supabase.auth.updateUser({password});
      if (result.error) { setError("Password update failed. Please try again."); return; }
      await supabase.auth.signOut();
      router.replace(returnRole === "driver" ? "/driver/auth?passwordUpdated=1" : "/rider/sign-in?passwordUpdated=1");
    } catch { setError("Password update failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:"24px",background:"#F7F7FB",color:"#19172A",fontFamily:"Inter,system-ui,sans-serif"}}>
    <section style={{width:"100%",maxWidth:420,background:"#FFFFFF",borderRadius:24,padding:"clamp(24px,6vw,40px)",boxShadow:"0 18px 70px #28217F14"}}>
      <Link href="/rider/sign-in" style={{color:"#5145E5",fontWeight:800,textDecoration:"none"}}>◆ NexRide</Link>
      <h1 style={{fontSize:28,letterSpacing:"-.04em",marginBottom:8}}>{verified?"Create a new password":"Verify your email"}</h1>
      <p style={{color:"#55546B",lineHeight:1.5}}>{verified?"Secure your account with a new password.":"Enter the unique six-digit code sent to your inbox."}</p>
      {!verified ? <form onSubmit={verify} style={{display:"grid",gap:14}}>
        <label>Account type<select value={returnRole} onChange={e=>setReturnRole(e.target.value as "rider" | "driver")} style={field}><option value="rider">Rider</option><option value="driver">Driver</option></select></label>
        <label>Verification purpose<select value={purpose} onChange={e=>{setPurpose(e.target.value as Purpose);setCode("");setError("");}} style={field}><option value="signup">Confirm new account</option><option value="recovery">Reset forgotten password</option></select></label>
        <label>Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={field} placeholder="you@example.com"/></label>
        <label>Six-digit code<input required type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} style={{...field,letterSpacing:".35em",fontSize:23,textAlign:"center"}} placeholder="000000"/></label>
        <button disabled={busy} type="submit" style={action}>{busy?"Verifying…":"Verify email"}</button>
        <button disabled={busy || !validEmail(email) || (lastSent > 0 && clock - lastSent < 60000)} type="button" onClick={resend} style={{...action,background:"#F0EEFF",color:"#28217F"}}>Resend code</button>
      </form> : <form onSubmit={changePassword} style={{display:"grid",gap:14}}>
        <label>New password<input required type="password" minLength={12} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} style={field}/></label>
        <label>Confirm password<input required type="password" minLength={12} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={field}/></label>
        <button disabled={busy} style={action}>Update password</button>
      </form>}
      {error&&<p role="alert" style={{color:"#B42318"}}>{error}</p>}
      {message&&<p role="status" style={{color:"#28217F"}}>{message}</p>}
      <p style={{fontSize:12,color:"#55546B",marginTop:20}}>Never share your verification code. NexRide will never ask for it by phone.</p>
    </section>
  </main>;
}
const field: React.CSSProperties = {display:"block",width:"100%",padding:"13px",marginTop:6,border:"1px solid #D8D5E6",borderRadius:12,background:"#FFFFFF",color:"#19172A",fontSize:16};
const action: React.CSSProperties = {width:"100%",border:0,borderRadius:12,padding:14,background:"#5145E5",color:"#FFFFFF",fontWeight:750,fontSize:15,cursor:"pointer"};

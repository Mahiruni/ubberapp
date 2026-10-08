"use client";

import Link from "next/link";
import { useContext, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { nexrideApiFetch } from "../../../lib/nexride-api-auth";
import {
  explicitSignOutRole, retryStartup,
} from "../../../lib/nexride-startup";
import {
  IDENTITY_DOCUMENT_TYPES, identityDocumentLabel, identityDocumentReusable,
  normalizeEthiopianPhone,
  sameIdentityDocumentScope,
} from "../../../lib/nexride-identity";
import { LanguageContext } from "../../../components/nexride/ui";
import "./manage.css";
import { identityActivityLabel } from "../../../lib/nexride-identity-events";

type Profile = {
  id: string; role: string; full_name: string | null;
  phone: string | null; account_status: string;
};
type Identity = {
  id: string; document_type: string; issuing_country: string;
  status: string; created_at: string; expires_at: string | null;
  storage_path: string | null; storage_bucket: string;
};
type Role = { role: string };
type Review = { id: string; category: string; status: string; created_at: string };
type Deletion = { id: string; status: string; created_at: string };
type IdentityActivity = { id: string; event_type: string; created_at: string };
type VerifiedPhone = { phone_e164: string; verified_at: string };
type UserRecord = {
  id: string; email?: string; email_confirmed_at?: string;
  phone?: string; phone_confirmed_at?: string;
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maskPhone = (value: string) => value.length < 7 ? "••••" : value.slice(0, 4) + " ••• " + value.slice(-3);

export default function NexRideManageAccountPage() {
  const router = useRouter();
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => language === "am" ? am : en;
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserRecord | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [documents, setDocuments] = useState<Identity[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activity, setActivity] = useState<IdentityActivity[]>([]);
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<VerifiedPhone | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpPending, setOtpPending] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [documentType, setDocumentType] = useState("fayda");
  const [documentCountry, setDocumentCountry] = useState("ET");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentExpiry, setDocumentExpiry] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [reviewCategory, setReviewCategory] = useState("duplicate_identity");
  const [reviewDetail, setReviewDetail] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  async function reload() {
    const auth = await supabase.auth.getUser();
    if (auth.error || !auth.data.user) {
      router.replace("/rider/sign-in");
      return;
    }
    const identity = auth.data.user;
    setUser(identity);
    const [pr, ro, docs, rev, del, phone, events] = await Promise.all([
      supabase.from("profiles").select("id,role,full_name,phone,account_status").eq("id", identity.id).maybeSingle(),
      supabase.from("account_roles").select("role").eq("user_id", identity.id),
      supabase.from("account_identity_documents").select("id,document_type,issuing_country,status,created_at,expires_at,storage_path,storage_bucket").eq("user_id", identity.id).order("created_at",{ascending:false}),
      supabase.from("account_identity_reviews").select("id,category,status,created_at").eq("user_id",identity.id).order("created_at",{ascending:false}).limit(8),
      supabase.from("account_deletion_requests").select("id,status,created_at").eq("user_id",identity.id).order("created_at",{ascending:false}).limit(1),
      supabase.from("account_verified_phones").select("phone_e164,verified_at").eq("user_id",identity.id).maybeSingle(),
      supabase.from("account_identity_events").select("id,event_type,created_at").eq("owner_id",identity.id).order("created_at",{ascending:false}).limit(12),
    ]);
    if (pr.error || !pr.data) throw new Error("Your account information could not be loaded.");
    setProfile(pr.data as Profile);
    if (ro.error || docs.error || rev.error || del.error || phone.error || events.error) {
      throw new Error("Verification information is temporarily unavailable.");
    }
    setRoles((ro.data || []) as Role[]);
    setDocuments((docs.data || []) as Identity[]);
    setReviews((rev.data || []) as Review[]);
    setDeletion((del.data?.[0] || null) as Deletion | null);
    setVerifiedPhone((phone.data || null) as VerifiedPhone | null);
    setActivity((events.data || []) as IdentityActivity[]);
    setLoading(false);
  }

  useEffect(() => {
    if (explicitSignOutRole(window.localStorage)) {
      router.replace("/rider/sign-in");
      return;
    }
    let mounted = true;
    void reload().catch(() => {
      if (mounted) { setError("Unable to load account details. Please refresh."); setLoading(false); }
    });
    return () => { mounted = false; };
    // Only refresh on mount. Explicit action handlers call reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await task(); }
    catch (cause) {
      setError(cause instanceof Error && /active.trip|payout/i.test(cause.message)
        ? "Complete your active trip or outstanding payout before proceeding."
        : "The account change could not be completed. Check the details and retry.");
    } finally { setBusy(false); }
  }

  async function requestPhoneOtp(event: FormEvent) {
    event.preventDefault();
    const phone = normalizeEthiopianPhone(otpPhone);
    if (!phone) { setError("Enter a valid Ethiopian mobile number."); return; }
    await run(async () => {
      const reservation = await supabase.rpc("account_prepare_verified_phone",{p_phone:phone});
      if (reservation.error || reservation.data !== "ready") {
        setNotice("Phone ownership requires verification or account recovery. Contact NexRide support if this number is already associated with you.");
        return;
      }
      const response = await supabase.auth.updateUser({phone});
      if (response.error) {
        setNotice("SMS verification is currently unavailable. Your existing account has not changed.");
        return;
      }
      setOtpPending(phone);
      setNotice("Enter the SMS code sent to your phone. No verified number changes until OTP succeeds.");
    });
  }

  async function verifyPhoneOtp(event: FormEvent) {
    event.preventDefault();
    if (!otpPending || !/^[0-9]{4,8}$/.test(otpCode)) {
      setError("Enter the code sent by SMS."); return;
    }
    await run(async () => {
      const verify = await supabase.auth.verifyOtp({phone:otpPending,token:otpCode,type:"phone_change"});
      if (verify.error) { setNotice("The code was not accepted. Try a new code or contact support."); return; }
      const claimed = await supabase.rpc("account_sync_verified_phone");
      if (claimed.error || claimed.data !== "verified") {
        setNotice("Phone verification needs ownership review. Contact NexRide support.");
        return;
      }
      setOtpPending(""); setOtpCode("");
      await reload();
      setNotice("Phone number verified and securely assigned to this account.");
    });
  }

  async function sendIdentity(event: FormEvent) {
    event.preventDefault();
    if (documents.some(d => sameIdentityDocumentScope(d, documentType, documentCountry))) {
      setNotice("Your existing identity document is already submitted or verified. Reuse that record.");
      return;
    }
    if (!user || !documentFile || !documentNumber.trim()) {
      setError("Enter the document details and choose a file."); return;
    }
    if (documentFile.size > 8*1024*1024 || !allowedTypes.has(documentFile.type)) {
      setError("Choose a JPG, PNG, WebP, or PDF no larger than 8 MB."); return;
    }
    await run(async () => {
      const ext = documentFile.type === "application/pdf" ? "pdf" :
        documentFile.type === "image/png" ? "png" :
        documentFile.type === "image/webp" ? "webp" : "jpg";
      const path = user.id + "/" + crypto.randomUUID() + "." + ext;
      const upload = await supabase.storage.from("nexride-identity").upload(path,documentFile,{
        upsert:false,contentType:documentFile.type,
      });
      if (upload.error) throw upload.error;
      const claim = await supabase.rpc("account_submit_identity_document",{
        p_type:documentType, p_country:documentCountry.toUpperCase(),
        p_identifier:documentNumber.trim(),p_storage_path:path,
        p_expiry:documentExpiry || null,
      });
      if (claim.error || claim.data !== "submitted") {
        // A failed claim is not verification evidence. Discard only that
        // unsubmitted upload; the Storage policy blocks deletion after claim.
        await supabase.storage.from("nexride-identity").remove([path]).catch(() => {});
        setNotice("This document needs an identity ownership or replacement review. No new identity was assigned.");
        return;
      }
      setDocumentNumber(""); setDocumentFile(null); setDocumentExpiry("");
      await reload();
      setNotice("Identity submitted once. NexRide will review it; no further upload is needed while it is pending.");
    });
  }

  async function sendReview(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    await run(async () => {
      const {error:reviewError}=await supabase.from("account_identity_reviews").insert({
        user_id:user.id,category:reviewCategory,detail:reviewDetail.trim().slice(0,1500),
      });
      if (reviewError) throw reviewError;
      setReviewDetail("");
      await reload();
      setNotice("Your private account ownership review request was submitted.");
    });
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) { setError("Use at least 8 password characters.");return;}
    await run(async () => {
      const result=await supabase.auth.updateUser({password:newPassword});
      if(result.error) throw result.error;
      setNewPassword("");
      setNotice("Password updated. Keep it private.");
    });
  }

  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    const value=newEmail.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)){setError("Enter a valid email.");return;}
    await run(async()=>{
      const result=await supabase.auth.updateUser({email:value});
      if(result.error) {
        setNotice("Email update requires account ownership verification. Contact support if needed.");
        return;
      }
      setNewEmail("");
      setNotice("Check your email for the confirmation link. Your existing sign-in remains active until verified.");
    });
  }

  async function signOutOtherDevices() {
    await run(async()=>{
      const result=await supabase.auth.signOut({scope:"others"});
      if(result.error) throw result.error;
      setNotice("Other device sessions were signed out. This device remains signed in.");
    });
  }

  async function selectRiderRole() {
    if (!user || !profile) return;
    await run(async()=>{
      if(profile.role==="driver"){
        const assigned=await supabase.from("ride_requests").select("id")
          .eq("assigned_driver_id",user.id).in("status",["accepted","arrived_pickup","in_trip"])
          .limit(1).maybeSingle();
        const availability=await supabase.from("drivers").select("is_online").eq("id",user.id).maybeSingle();
        if(assigned.error || availability.error || assigned.data || availability.data?.is_online){
          setNotice("Finish active trips and go Offline in Driver before switching to Rider.");
          return;
        }
      }
      const {data,error:roleError}=await supabase.rpc("account_activate_rider_role");
      if(roleError || data!=="ready") throw new Error("role_not_available");
      window.localStorage.setItem("nexride:active-account-role","rider");
      retryStartup(false);
      window.location.assign("/");
    });
  }
  async function selectDriverRole() {
    if(profile?.role!=="driver"){router.push("/driver/onboarding");return;}
    window.localStorage.setItem("nexride:active-account-role","driver");
    retryStartup(false);
    window.location.assign("/driver/home");
  }

  async function requestDeletion(event: FormEvent) {
    event.preventDefault();
    if (!user?.email || !profile) return;
    await run(async()=>{
      // Reauthenticate on the server. The browser never writes deletion
      // requests directly and stays signed in with its existing session.
      const response=await nexrideApiFetch("/api/account/deletion-request",{
        method:"POST",body:JSON.stringify({password:deletePassword,confirm:true}),
      });
      const result=await response.json().catch(()=>({status:"account_review_unavailable"}));
      if(!response.ok){
        const message=result.status==="reauthentication_failed"
          ? "Password confirmation failed. No deletion request was submitted."
          : result.status==="outstanding_obligations"
            ? "Finish active trips or unresolved payouts before requesting deletion."
            : "Account deletion review could not be requested. Please try again.";
        setNotice(message);return;
      }
      setDeletePassword("");setDeleteConfirm(false);
      await reload();
      setNotice(result.status==="already_requested"
        ? "You already have an open deletion-review request."
        : "Deletion request received for authorized review. Your account and records remain intact.");
    });
  }

  const back=profile?.role==="driver"?"/driver/profile":"/";
  const activeDocs=documents.filter(d=>identityDocumentReusable(d.status));
  const existingDocument=activeDocs.find(d=>sameIdentityDocumentScope(d,documentType,documentCountry));
  return (
    <main className="nex-manage">
      <div className="nex-manage-top">
        <Link href={back} className="nex-manage-back">← {say("Back","ተመለስ")}</Link>
        <div className="nex-manage-brand">N<span>EXRIDE</span> <small>· ACCOUNT</small></div>
      </div>
      <div className="nex-manage-content">
        <header className="nex-manage-intro">
          <span>{say("YOUR IDENTITY • YOUR CONTROL","የእርስዎ መለያ • የእርስዎ ቁጥጥር")}</span>
          <h1>{say("Manage account","መለያን ያስተዳድሩ")}</h1>
          <p>{say("One secure NexRide identity for Rider and Driver. Existing verified information is reused.","ለተሳፋሪና ለአሽከርካሪ አንድ ደህንነቱ የተጠበቀ መለያ።")}</p>
        </header>
        {error && <div className="nex-manage-error" role="alert">{error}</div>}
        {notice && <div className="nex-manage-notice" role="status">{notice}</div>}
        {loading ? <section className="nex-manage-card" aria-busy="true">{say("Loading your verified account…","መለያዎ በመጫን ላይ…")}</section> : !profile || !user ? (
          <section className="nex-manage-card">
            {say("Sign in to access your account.","መለያዎን ለማየት ይግቡ።")}
            <Link href="/rider/sign-in">{say("Sign in","ግባ")}</Link>
          </section>
        ) : <>
          <section className="nex-manage-card nex-manage-identity">
            <div className="nex-manage-avatar" aria-hidden="true">
              {(profile.full_name || user.email || "N").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
            </div>
            <div>
              <span className="nex-manage-eyebrow">{say("PRIMARY ACCOUNT","ዋና መለያ")}</span>
              <h2>{profile.full_name || say("NexRide member","NexRide አባል")}</h2>
              <p>{user.email || "Email unavailable"}</p>
              <div className="nex-manage-chips">
                <span>{user.email_confirmed_at ? say("Email verified","ኢሜይል ተረጋግጧል") : say("Email pending","ኢሜይል በጥበቃ ላይ")}</span>
                <span>{verifiedPhone ? say("Phone verified","ስልክ ተረጋግጧል") : say("Phone not verified","ስልክ አልተረጋገጠም")}</span>
                <span>{profile.account_status}</span>
              </div>
            </div>
          </section>

          <section className="nex-manage-card">
            <div className="nex-manage-section"><h2>{say("Personal information","የግል መረጃ")}</h2><p>{say("Your primary email and verified phone belong to this account.","የመለያዎ መረጃ።")}</p></div>
            <div className="nex-manage-detail"><span>Email</span><strong>{user.email||"—"}</strong></div>
            <div className="nex-manage-detail"><span>{say("Contact phone","የስልክ ቁጥር")}</span><strong>{profile.phone||say("Not provided","የለም")}</strong></div>
            <div className="nex-manage-detail"><span>{say("Verified phone owner","የተረጋገጠ ስልክ")}</span><strong>{verifiedPhone ? maskPhone(verifiedPhone.phone_e164) : say("Not verified","አልተረጋገጠም")}</strong></div>
          </section>

          <section className="nex-manage-card">
            <div className="nex-manage-section"><h2>{say("Rider & Driver access","የተሳፋሪና አሽከርካሪ መዳረሻ")}</h2><p>{say("Switch services without making another account or duplicating your identity.","አዲስ መለያ ሳይፈጥሩ አገልግሎት ይቀይሩ።")}</p></div>
            <div className="nex-manage-role">
              <div><strong>{say("Rider","ተሳፋሪ")}</strong><small>{roles.some(r=>r.role==="rider") ? say("Available on this identity","በዚህ መለያ ይገኛል") : say("Can be enabled for this account","መንቃት ይቻላል")}</small></div>
              <button type="button" disabled={busy} onClick={()=>void selectRiderRole()}>{say("Use Rider","ተሳፋሪ")}</button>
            </div>
            <div className="nex-manage-role">
              <div><strong>{say("Driver","አሽከርካሪ")}</strong><small>{roles.some(r=>r.role==="driver") ? say("Driver role registered; approval is separate","የአሽከርካሪ ማረጋገጫ ያስፈልጋል") : say("Apply using this same account","በዚህ መለያ ያመልክቱ")}</small></div>
              <button type="button" disabled={busy} onClick={()=>void selectDriverRole()}>{profile.role==="driver" ? say("Use Driver","አሽከርካሪ") : say("Apply","ያመልክቱ")}</button>
            </div>
          </section>

          <section className="nex-manage-card">
            <div className="nex-manage-section"><h2>{say("Verification center","የማረጋገጫ ማዕከል")}</h2><p>{say("Approved or pending documents are restored automatically and never requested twice.","የተረጋገጡ እና በጥበቃ ላይ ያሉ ሰነዶች በራስ ሰር ይቀመጣሉ።")}</p></div>
            {documents.length===0 ? <p className="nex-manage-muted">{say("No identity documents submitted yet.","ሰነድ ገና አልተላከም።")}</p>
              : documents.map(doc=><div className="nex-manage-detail" key={doc.id}>
                  <span>{identityDocumentLabel(doc.document_type)} · {doc.issuing_country}</span>
                  <strong className={"nex-manage-status "+doc.status}>{doc.status.replace("_"," ")}</strong>
                </div>)}
            {profile.role==="driver" && <p className="nex-manage-muted"><Link href="/driver/profile/documents">{say("Review existing Driver and vehicle documents →","የአሽከርካሪ ሰነዶች →")}</Link></p>}
            <form onSubmit={e=>void sendIdentity(e)} className="nex-manage-form">
              <h3>{existingDocument?say("Document already on file","ሰነዱ ተቀምጧል"):say("Submit a new identity","አዲስ የማንነት ማረጋገጫ")}</h3>
              <label>{say("Document type","የሰነድ አይነት")}
                <select value={documentType} onChange={e=>setDocumentType(e.target.value)}>
                  {IDENTITY_DOCUMENT_TYPES.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label>{say("Issuing country (2-letter code)","ሀገር")}
                <input value={documentCountry} maxLength={2} onChange={e=>setDocumentCountry(e.target.value.toUpperCase())} required pattern="[A-Za-z]{2}"/>
              </label>
              {existingDocument ? <div className="nex-manage-notice">
                {say("This document is already submitted or approved. No new upload is needed. Replacement requires review.","ይህ ሰነድ ቀድሞ ተመዝግቧል።")}
              </div> : <>
                <label>{say("Document number (kept private)","የሰነድ ቁጥር")}
                  <input value={documentNumber} onChange={e=>setDocumentNumber(e.target.value)} autoComplete="off" maxLength={80} required/>
                </label>
                <label>{say("Expiry date (if applicable)","የማብቂያ ቀን")}
                  <input type="date" value={documentExpiry} onChange={e=>setDocumentExpiry(e.target.value)} />
                </label>
                <label>{say("Private document photo or PDF","የሰነድ ፎቶ")}
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e=>setDocumentFile(e.target.files?.[0]||null)} required />
                </label>
                <button type="submit" disabled={busy}>{busy?say("Submitting…","በማስገባት ላይ…"):say("Submit for review","ለማረጋገጫ ላክ")}</button>
              </>}
            </form>
          </section>

          <section className="nex-manage-card">
            <div className="nex-manage-section">
              <h2>{say("Security activity","የመለያ ደህንነት እንቅስቃሴ")}</h2>
              <p>{say("Private verification history with no identity numbers, phone numbers or document file paths.","ስሱ መረጃ የሌለው የግል የማረጋገጫ ታሪክ።")}</p>
            </div>
            {activity.length===0
              ? <p className="nex-manage-muted">{say("No recent activity; previous verified records remain available above.","አዲስ እንቅስቃሴ የለም።")}</p>
              : activity.map(entry=><div className="nex-manage-detail" key={entry.id}>
                  <span>{identityActivityLabel(entry.event_type,language==="am"?"am":"en")}</span>
                  <strong>{new Date(entry.created_at).toLocaleDateString(language==="am"?"am-ET":"en-ET")}</strong>
                </div>)}
          </section>

          <section className="nex-manage-card">
            <div className="nex-manage-section"><h2>{say("Verified phone","የተረጋገጠ ስልክ")}</h2><p>{say("Only an SMS-confirmed number can be reserved to an identity. An unverified profile phone is not proof of ownership.","የተረጋገጠ ስልክ ብቻ ለመለያ ይመዘገባል።")}</p></div>
            <form onSubmit={e=>void requestPhoneOtp(e)} className="nex-manage-form">
              <label>{say("Ethiopian mobile number","የኢትዮጵያ ስልክ")}
                <input type="tel" placeholder="+251 9…" autoComplete="tel" value={otpPhone} onChange={e=>setOtpPhone(e.target.value)} required/>
              </label>
              <button type="submit" disabled={busy}>{say("Send verification code","የማረጋገጫ ኮድ ላክ")}</button>
            </form>
            {otpPending && <form className="nex-manage-form" onSubmit={e=>void verifyPhoneOtp(e)}>
              <p className="nex-manage-muted">{say("Code sent to","ኮድ የተላከው ወደ")} {maskPhone(otpPending)}</p>
              <label>{say("SMS verification code","የኤስ ኤም ኤስ ኮድ")}
                <input inputMode="numeric" autoComplete="one-time-code" value={otpCode} onChange={e=>setOtpCode(e.target.value)} maxLength={8} required/>
              </label>
              <button type="submit" disabled={busy}>{say("Verify phone","ስልክን አረጋግጥ")}</button>
            </form>}
          </section>

          <section className="nex-manage-card">
            <div className="nex-manage-section"><h2>{say("Security & sessions","ደህንነት እና መግቢያ")}</h2><p>{say("Make changes only after signing in. Explicit sign-out remains effective.","የመለያዎን ደህንነት ያስተዳድሩ።")}</p></div>
            <form className="nex-manage-form" onSubmit={e=>void changeEmail(e)}>
              <label>{say("New email address","አዲስ ኢሜይል")}
                <input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} autoComplete="email" required />
              </label>
              <button type="submit" disabled={busy}>{say("Request email change","ኢሜይል ቀይር")}</button>
            </form>
            <form className="nex-manage-form" onSubmit={e=>void changePassword(e)}>
              <label>{say("New password","አዲስ የይለፍ ቃል")}
                <input type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/>
              </label>
              <button type="submit" disabled={busy}>{say("Update password","የይለፍ ቃል አዘምን")}</button>
            </form>
            <div className="nex-manage-actions">
              <button type="button" disabled={busy} onClick={()=>void signOutOtherDevices()}>{say("Sign out other devices","ከሌሎች መሣሪያዎች ውጣ")}</button>
              <Link href={profile.role==="driver"?"/driver/profile":"/"}>{say("Return to app","ወደ መተግበሪያ")}</Link>
            </div>
          </section>

          <section className="nex-manage-card">
            <div className="nex-manage-section"><h2>{say("Account ownership & recovery","የመለያ ባለቤትነት")}</h2><p>{say("Request a private review. Never upload someone else's identity or expose private numbers.","የግል የመለያ ግምገማ ይጠይቁ።")}</p></div>
            {reviews.map(r=><div className="nex-manage-detail" key={r.id}><span>{r.category.replace(/_/g," ")}</span><strong>{r.status}</strong></div>)}
            <form className="nex-manage-form" onSubmit={e=>void sendReview(e)}>
              <label>{say("Review type","የግምገማ አይነት")}
                <select value={reviewCategory} onChange={e=>setReviewCategory(e.target.value)}>
                  <option value="duplicate_identity">Duplicate identity</option>
                  <option value="phone_ownership">Phone ownership</option>
                  <option value="document_replacement">Replace an expired or incorrect document</option>
                  <option value="account_recovery">Account recovery</option>
                </select>
              </label>
              <label>{say("Describe the issue (no passwords or full ID numbers)","የችግኙ መግለጫ")}
                <textarea rows={3} maxLength={1500} value={reviewDetail} onChange={e=>setReviewDetail(e.target.value)} required />
              </label>
              <button type="submit" disabled={busy}>{say("Request secure review","የግምገማ ጥያቄ ላክ")}</button>
            </form>
          </section>

          <section className="nex-manage-card nex-manage-danger">
            <div className="nex-manage-section"><h2>{say("Account deletion","መለያ መሰረዝ")}</h2><p>{say("Deletion requires reauthentication, active-trip and payment checks, and authorized review. Your data is not removed just by requesting.","ለመሰረዝ የደህንነት ማረጋገጫ ያስፈልጋል።")}</p></div>
            {deletion && <p className="nex-manage-notice">Request: {deletion.status}</p>}
            {!deletion || !["pending","under_review","on_hold"].includes(deletion.status) ? <>
              {!deleteConfirm ? <button type="button" className="nex-manage-danger-button" onClick={()=>setDeleteConfirm(true)}>{say("Request account deletion","መለያ መሰረዝን ጠይቅ")}</button>
                : <form className="nex-manage-form" onSubmit={e=>void requestDeletion(e)}>
                    <label>{say("Confirm your password","የይለፍ ቃልዎን ያረጋግጡ")}
                      <input type="password" autoComplete="current-password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} required/>
                    </label>
                    <div className="nex-manage-actions">
                      <button type="button" onClick={()=>{setDeleteConfirm(false);setDeletePassword("");}}>{say("No, keep my account","አይ፣ መለያው ይቆይ")}</button>
                      <button type="submit" className="nex-manage-danger-button" disabled={busy}>{say("Yes, request review","አዎ፣ ጥያቄውን ላክ")}</button>
                    </div>
                  </form>}
            </> : <p className="nex-manage-muted">{say("Your request is in review. Existing data remains protected.","ጥያቄዎ በግምገማ ላይ ነው።")}</p>}
          </section>
        </>}
      </div>
    </main>
  );
}

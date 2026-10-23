"use client";

import { FormEvent, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NexRideFeedbackSettings } from "../../../../components/nexride/feedback-settings";
import { PermissionSettings } from "../../../../components/nexride/permission-settings";
import { NativeReliabilitySettings } from "../../../../components/nexride/native-reliability-settings";
import { SettingsGroups } from "../../../../components/nexride/settings-groups";
import { Icon, LanguageContext, useTranslation } from "../../../../components/nexride/ui";
import { announceLanguage } from "../../../../components/nexride/language-provider";
import { DriverThemeSelector } from "../../../../components/nexride/driver-app-shell";
import { supabase } from "../../../../lib/supabase";
import { loadDriverProfileData, type DriverProfileData } from "../../../../lib/nexride-driver-profile";
import "../../../nexride.css";
import "../profile.css";
import "../../../detail-system.css";

export default function DriverProfileSettingsPage() {
  const router = useRouter();
  const language = useContext(LanguageContext);
  const t = useTranslation();
  const say = (en: string, am: string) => language === "am" ? am : en;
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const session = data.session;
      if (!active) return;
      if (!session) {
        router.replace("/driver/auth");
        return;
      }

      const next = await loadDriverProfileData(session.user.id);
      if (next.role !== "driver") {
        router.replace(next.role === "admin" ? "/admin" : "/");
        return;
      }

      if (!active) return;
      setProfile(next);
      setName(next.fullName);
      setPhone(next.phone);
      setLoading(false);
    })().catch(() => {
      if (active) {
        setFeedback(t("entryProfileLoadFailure"));
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || busy || profile.accountStatus !== "active") return;

    const cleanName = name.trim();

    if (cleanName.length < 2 || cleanName.length > 80) {
      setSuccess(false);
      setFeedback(t("entryNameRequired"));
      return;
    }

    setBusy(true);
    setFeedback("");
    setSuccess(false);

    try {
    // Reconfirm the authoritative authenticated identity immediately before
    // mutating a protected profile; the phone/email remain OTP-owned fields.
    const identity = await supabase.auth.getUser();
    if (identity.error || identity.data.user?.id !== profile.id) {
      setFeedback(t("entryProfileSaveFailure"));
      return;
    }
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ full_name: cleanName })
      .eq("id", identity.data.user.id).select("id,full_name").single();

    if (error || !updated || updated.id !== profile.id) {
      setFeedback(t("entryProfileSaveFailure"));
      return;
    }

    // The secured profiles row is authoritative. A metadata refresh must not
    // undo a confirmed profile save if the auth endpoint is temporarily down.
    await supabase.auth.updateUser({ data: { full_name: cleanName } }).catch(() => {});
    window.dispatchEvent(new Event("nexride:profile-change"));

    setProfile({ ...profile, fullName: updated.full_name || cleanName });
    setName(updated.full_name || cleanName);
    setSuccess(true);
    setFeedback(t("entryProfileSaved"));
    } catch {
      setFeedback(t("entryProfileSaveFailure"));
    } finally {
      setBusy(false);
    }
  }

  return <main className="nr-app nr-driver-profile-subpage" data-mode="driver">
    <div className="nr-driver-profile-subwrap">
      <header className="nr-profile-subhead"><div><span className="nr-driver-kicker">BILOO · {t("driver")}</span><h1>{t("settings")}</h1><p>{t("entrySettingsIntro")}</p></div><button type="button" className="biloo-account-return" aria-label={say("Back to Account","ወደ መለያ ተመለስ")} onClick={()=>router.push("/driver/profile")}><Icon name="back" size={18}/></button></header>
      {loading ? <div className="nr-driver-profile-loading" aria-busy="true"><span className="wide"/><span className="panel"/></div> : profile ? <>
        {profile.accountStatus !== "active" && <div className="nr-profile-alert" role="status"><Icon name="info" size={17}/><span>{t("entryEditingLimited")}</span></div>}
        <SettingsGroups groups={[
      { id: "legal", icon: "shield", title: say("Legal documents", "ሕጋዊ ሰነዶች"), summary: say("Privacy and terms", "ግላዊነት እና ውሎች"), children: <nav className="biloo-settings-links" aria-label="Legal documents"><a href="/explore/privacy">Privacy policy <span>›</span></a><a href="/explore/terms">Terms of service <span>›</span></a></nav> },

          { id: "account", icon: "user", title: say("Account", "መለያ"), summary: say("Personal details, documents and vehicle", "የግል መረጃ፣ ሰነዶች እና ተሽከርካሪ"), children: <>
        <section className="nr-profile-panel">
          <div className="nr-profile-panel-head"><div><h2>{t("entryPersonalInfo")}</h2><p>{t("entryPersonalInfoIntro")}</p></div></div>
          <form className="nr-profile-form" onSubmit={save} aria-busy={busy}>
            <label>{t("fullName")}<input value={name} maxLength={80} autoComplete="name" onChange={e => {setName(e.target.value);setFeedback("");setSuccess(false)}} disabled={profile.accountStatus !== "active"} required/></label>
            <label>{t("phoneNumber")}<input value={phone} type="tel" autoComplete="tel" readOnly aria-describedby="nr-phone-verify-note"/></label>
            <small id="nr-phone-verify-note">{t("entryContactNote")}</small>
            <label>{t("authEmail")}<input value={profile.email || "—"} readOnly aria-describedby="nr-email-note"/></label>
            <small id="nr-email-note">{t("entryEmailNote")}</small>
            <div className="biloo-profile-form-actions">
              <button type="button" className="biloo-account-cancel" disabled={busy} onClick={() => {
                setName(profile.fullName);
                setPhone(profile.phone);
                setFeedback("");
                setSuccess(false);
                router.push("/driver/profile");
              }}>{say("Cancel","ተወው")}</button>
              <button type="submit" disabled={busy || profile.accountStatus !== "active" || name.trim() === profile.fullName}>{t(busy ? "entrySaving" : "entrySaveChanges")}</button>
            </div>
          </form>
          {feedback && <div className={"nr-profile-alert " + (success ? "success" : "")} role={success ? "status" : "alert"}><Icon name={success ? "check" : "info"} size={17}/><span>{feedback}</span></div>}

        </section>
          </> },
          { id: "notifications", icon: "bell", title: say("Notifications", "ማሳወቂያዎች"), summary: say("Ride alerts, sounds and haptics", "የጉዞ ማሳወቂያ፣ ድምፅ እና ንዝረት"), children: <>
            <PermissionSettings/><NexRideFeedbackSettings role="driver" language={language}/><NativeReliabilitySettings role="driver"/>
          </> },
          { id: "appearance", icon: "globe", title: say("Language & Appearance", "ቋንቋ እና ገጽታ"), summary: say("English, Amharic and your theme", "እንግሊዝኛ፣ አማርኛ እና ገጽታ"), children: <>
        <section className="nr-profile-panel"><div className="nr-profile-panel-head"><div><h2>{t("entryPreferences")}</h2><p>{t("appearanceHint")}</p></div></div>
          <div className="nr-driver-preference-block"><div className="nr-driver-preference-label"><strong>{t("appearance")}</strong></div><DriverThemeSelector/></div>
          <div className="nr-driver-preference-block"><div className="nr-driver-preference-label"><strong>{t("language")}</strong></div><div className="nr-driver-language-selector" role="group" aria-label={t("language")}><button type="button" data-active={language === "en"} aria-pressed={language === "en"} onClick={() => announceLanguage("en")}>English</button><button type="button" data-active={language === "am"} aria-pressed={language === "am"} onClick={() => announceLanguage("am")}>አማርኛ</button></div></div>
        </section>
          </> },
        ]}/>
      </> : <section className="nr-profile-state-card" role="alert"><Icon name="info" size={22}/><strong>{t("entrySettingsUnavailable")}</strong><p>{feedback || t("entryProfileLoadFailure")}</p><button type="button" onClick={() => window.location.reload()}>{t("tryAgain")}</button></section>}
    </div>
  </main>;
}

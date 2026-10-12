"use client";

import { FormEvent, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NexRideFeedbackSettings } from "../../../../components/nexride/feedback-settings";
import { PermissionSettings } from "../../../../components/nexride/permission-settings";
import { NativeReliabilitySettings } from "../../../../components/nexride/native-reliability-settings";
import { AppLockSettings } from "../../../../components/nexride/app-lock-settings";
import { SettingsGroups } from "../../../../components/nexride/settings-groups";
import { AppVersion } from "../../../../components/nexride/app-version";
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
  const [editing, setEditing] = useState(false);
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

    if (!cleanName) {
      setSuccess(false);
      setFeedback(t("entryNameRequired"));
      return;
    }

    setBusy(true);
    setFeedback("");
    setSuccess(false);

    try {
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: cleanName })
      .eq("id", profile.id).select("id").single();

    if (error) {
      setFeedback(t("entryProfileSaveFailure"));
      return;
    }

    // The secured profiles row is authoritative. A metadata refresh must not
    // undo a confirmed profile save if the auth endpoint is temporarily down.
    await supabase.auth.updateUser({ data: { full_name: cleanName } }).catch(() => {});
    window.dispatchEvent(new Event("nexride:profile-change"));

    setProfile({ ...profile, fullName: cleanName });
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
      <header className="nr-profile-subhead"><div><button className="nr-settings-back" type="button" onClick={() => router.push("/driver/profile")}><Icon name="back" size={19}/>{t("back")}</button><span className="nr-driver-kicker">NEXRIDE · {t("driver")}</span><h1>{t("settings")}</h1><p>{t("entrySettingsIntro")}</p></div></header>
      {loading ? <div className="nr-driver-profile-loading" aria-busy="true"><span className="wide"/><span className="panel"/></div> : profile ? <>
        {profile.accountStatus !== "active" && <div className="nr-profile-alert" role="status"><Icon name="info" size={17}/><span>{t("entryEditingLimited")}</span></div>}
        <SettingsGroups homeLabel={t("settings")} backLabel={say("Back to Settings", "ወደ ቅንብሮች ተመለስ")} groups={[
          { id: "account", icon: "user", title: say("Account", "መለያ"), summary: say("Personal details, documents and vehicle", "የግል መረጃ፣ ሰነዶች እና ተሽከርካሪ"), children: <>
        <section className="nr-profile-panel">
          <div className="nr-profile-panel-head"><div><h2>{t("entryPersonalInfo")}</h2><p>{t("entryPersonalInfoIntro")}</p></div></div>
          <div className="nr-settings-account-overview">
            <div><strong>{t("fullName")}</strong><span>{profile.fullName}</span></div>
            <div><strong>{t("phoneNumber")}</strong><span>{phone || "—"}</span></div>
            <div><strong>{t("authEmail")}</strong><span>{profile.email || "—"}</span></div>
            <button type="button" className="nr-settings-edit-button" onClick={() => setEditing(value => !value)}>{editing ? say("Hide editor", "አርታዒውን ዝጋ") : say("Edit personal information", "የግል መረጃን አርትዕ")}</button>
          </div>
          {editing && <form className="nr-profile-form" onSubmit={save} aria-busy={busy}>
            <label>{t("fullName")}<input value={name} maxLength={100} autoComplete="name" onChange={e => setName(e.target.value)} disabled={profile.accountStatus !== "active"} required/></label>
            <label>{t("phoneNumber")}<input value={phone} type="tel" autoComplete="tel" readOnly aria-describedby="nr-phone-verify-note"/></label>
            <small id="nr-phone-verify-note">{t("entryContactNote")}</small>
            <label>{t("authEmail")}<input value={profile.email || "—"} readOnly aria-describedby="nr-email-note"/></label>
            <small id="nr-email-note">{t("entryEmailNote")}</small>
            <button type="submit" disabled={busy || profile.accountStatus !== "active"}>{t(busy ? "entrySaving" : "entrySaveChanges")}</button>
          </form>}
          {feedback && <div className={"nr-profile-alert " + (success ? "success" : "")} role={success ? "status" : "alert"}><Icon name={success ? "check" : "info"} size={17}/><span>{feedback}</span></div>}

        </section>
        <section className="nr-profile-panel"><div className="nr-profile-panel-head"><div><h2>{t("entryVerifiedInformation")}</h2><p>{t("entryVerifiedInformationHint")}</p></div></div><div className="nr-doc-actions"><button className="nr-doc-secondary" onClick={() => router.push("/driver/profile/documents")}><Icon name="shield" size={16}/>{t("entryDocuments")}</button><button className="nr-doc-secondary" onClick={() => router.push("/driver/profile/vehicle")}><Icon name="pin" size={16}/>{t("entryVehicle")}</button></div></section>
            <a className="nr-settings-security-link" href="/account/manage?role=driver#account-deletion">{say("Account deletion", "መለያ መሰረዝ")}<Icon name="chevron" size={17}/></a>
          </> },
          { id: "security", icon: "shield", title: say("Security & App Lock", "ደህንነት እና የመተግበሪያ ቁልፍ"), summary: say("App lock, sessions and permissions", "የመተግበሪያ ቁልፍ፣ መግቢያ እና ፈቃዶች"), children: <>
            <AppLockSettings/><PermissionSettings/>
          <a className="nr-settings-security-link" href="/account/manage?role=driver#account-security"><Icon name="shield" size={20}/><span>{t("entryAccountSecurity")}</span><Icon name="chevron" size={17}/></a>
          </> },
          { id: "notifications", icon: "bell", title: say("Notifications", "ማሳወቂያዎች"), summary: say("Ride alerts, sounds and haptics", "የጉዞ ማሳወቂያ፣ ድምፅ እና ንዝረት"), children: <>
            <NexRideFeedbackSettings role="driver" language={language}/><NativeReliabilitySettings role="driver"/>
          </> },
          { id: "appearance", icon: "globe", title: say("Language & Appearance", "ቋንቋ እና ገጽታ"), summary: say("English, Amharic and your theme", "እንግሊዝኛ፣ አማርኛ እና ገጽታ"), children: <>
        <section className="nr-profile-panel"><div className="nr-profile-panel-head"><div><h2>{t("entryPreferences")}</h2><p>{t("appearanceHint")}</p></div></div>
          <div className="nr-driver-preference-block"><div className="nr-driver-preference-label"><strong>{t("appearance")}</strong></div><DriverThemeSelector/></div>
          <div className="nr-driver-preference-block"><div className="nr-driver-preference-label"><strong>{t("language")}</strong></div><div className="nr-driver-language-selector" role="group" aria-label={t("language")}><button type="button" data-active={language === "en"} aria-pressed={language === "en"} onClick={() => announceLanguage("en")}>English</button><button type="button" data-active={language === "am"} aria-pressed={language === "am"} onClick={() => announceLanguage("am")}>አማርኛ</button></div></div>
        </section>
          </> },
          { id: "help", icon: "info", title: say("Help & About", "እገዛ እና ስለ እኛ"), summary: say("Support, legal and app information", "ድጋፍ፣ ሕጋዊ መረጃ እና ስለ መተግበሪያው"), children: <>
        <nav className="nr-settings-legal" aria-label={t("entryAccountSecurity")}><a href="/support?role=driver">{t("help")}</a><a href="/explore/terms">{t("entryTerms")}</a><a href="/explore/privacy">{t("entryPrivacy")}</a><a href="/explore/about">{language === "am" ? "ስለ NexRide" : "About NexRide"}</a></nav><AppVersion/>
          </> },
        ]}/>
      </> : <section className="nr-profile-state-card" role="alert"><Icon name="info" size={22}/><strong>{t("entrySettingsUnavailable")}</strong><p>{feedback || t("entryProfileLoadFailure")}</p><button type="button" onClick={() => window.location.reload()}>{t("tryAgain")}</button></section>}
    </div>
  </main>;
}

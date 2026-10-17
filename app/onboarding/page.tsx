"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntryShell } from "../../components/nexride/entry";
import {
  Button,
  StatusBanner,
  useTranslation,
} from "../../components/nexride/ui";
import {
  enterRider,
  ONBOARDING_KEY,
  PREVIEW_ENABLED_KEY,
} from "../../lib/nexride-startup";
import "../nexride.css";
import "../detail-system.css";
export default function Onboarding() {
  return (
    <EntryShell>
      <Welcome />
    </EntryShell>
  );
}
function Welcome() {
  const t = useTranslation();
  const router = useRouter();
  const finish = (preview: boolean) => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
      if (preview) localStorage.setItem(PREVIEW_ENABLED_KEY, "true");
    } catch {}
    if (preview) enterRider(null);
    router.replace(preview ? "/" : "/rider/sign-in");
  };
  return (
    <>
      <span className="nr-rider-entry-kicker">NEXRIDE · {t("rider")}</span>
      <h1>{t("entryWelcomeTitle")}</h1>
      <p>{t("entryWelcomeIntro")}</p>
      <div className="nr-rider-entry-actions">
        <Link className="nr-rider-get-started" href="/rider/sign-up">{t("createAccount")}</Link>
        <Button variant="ghost" onClick={() => finish(false)}>{t("signIn")}</Button>
      </div>
      <Link className="nr-auth-role-link" href="/driver">{t("entrySwitchDriver")}</Link>
      <details className="nr-auth-preview"><summary>{t("explorePreview")}</summary><StatusBanner compact>{t("previewInfo")}</StatusBanner><Button variant="ghost" onClick={() => finish(true)}>{t("explorePreview")}</Button></details>
    </>
  );
}

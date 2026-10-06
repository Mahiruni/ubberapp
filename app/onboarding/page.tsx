"use client";
import { useRouter } from "next/navigation";
import { EntryPhoto, EntryShell } from "../../components/nexride/entry";
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
import "./detail-system.css";
export default function Onboarding() {
  return (
    <EntryShell photoCredit>
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
      <h1>{t("welcome")}</h1>
      <p>{t("onboardingIntro")}</p>
      <EntryPhoto />
      <StatusBanner>{t("previewInfo")}</StatusBanner>
      <Button onClick={() => finish(false)}>{t("continueAuth")}</Button>
      <Button variant="ghost" onClick={() => finish(true)}>
        {t("explorePreview")}
      </Button>
    </>
  );
}

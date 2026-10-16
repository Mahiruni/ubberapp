"use client";
import { useEffect, useState } from "react";
import { Icon, useTranslation } from "./ui";
import { NEXRIDE_SITE_URL } from "../../lib/nexride-site";

const DISMISS_KEY = "nexride.recommend.dismissed.v1";
/** Optional organic recommendation. Never includes a trip, identity, tracking code or reward claim. */
export function RecommendNexRide({ score }: { score: number }) {
  const t = useTranslation();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"copied" | "unavailable" | "">("");
  useEffect(() => {
    try { setVisible(Number.isInteger(score) && score >= 4 && score <= 5 && !localStorage.getItem(DISMISS_KEY)); } catch { setVisible(false); }
  }, [score]);
  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, "true"); } catch {}
  }
  async function share() {
    if (busy) return;
    setBusy(true); setResult("");
    const url = `${NEXRIDE_SITE_URL}/explore`;
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Share")) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: "NexRide", text: t("brandConfidence"), url });
        dismiss(); return;
      }
      if (navigator.share) {
        await navigator.share({ title: "NexRide", text: t("brandConfidence"), url });
        dismiss(); return;
      }
      await navigator.clipboard.writeText(url); setResult("copied");
    } catch (error) {
      // Cancellation is a choice, not an error and must not silently copy anything.
      if (!(error instanceof Error && /cancel|abort/i.test(error.name + error.message))) setResult("unavailable");
    } finally { setBusy(false); }
  }
  if (!visible || !Number.isInteger(score) || score < 4 || score > 5) return null;
  return <section className="nr-recommend" aria-label={t("brandRecommend")}>
    <div><Icon name="share" size={22}/><h2>{t("brandRecommend")}</h2><p>{t("brandRecommendIntro")}</p></div>
    <div className="nr-recommend-actions"><button type="button" disabled={busy} onClick={() => void share()}>{t("brandShareNexRide")}</button><button type="button" onClick={dismiss}>{t("brandDismiss")}</button></div>
    {result && <p role="status">{t(result === "copied" ? "brandLinkCopied" : "brandShareUnavailable")}</p>}
  </section>;
}

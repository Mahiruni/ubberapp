"use client";
import Link from "next/link";
import { useContext, useEffect, useState } from "react";
import { BrandLanguageSwitch } from "../../../components/nexride/confidence";
import { Icon, LanguageContext, useTranslation } from "../../../components/nexride/ui";
import { nexrideApiFetch } from "../../../lib/nexride-api-auth";
import type { ServiceQualitySummary } from "../../../lib/nexride-service-quality";
import "./quality.css";

type QualityData = { metrics: ServiceQualitySummary; from: string; to: string; totalRequests: number; sampled: boolean };
export default function AdminQualityPage() {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const [days, setDays] = useState("7");
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<QualityData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const abort = new AbortController();
    setState("loading"); setData(null);
    void nexrideApiFetch(`/api/admin/service-quality?days=${days}`, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error("unavailable");
        const body = await response.json();
        if (body.status !== "ready" || !body.metrics) throw new Error("invalid_response");
        if (!abort.signal.aborted) { setData(body); setState("ready"); }
      }).catch(() => { if (!abort.signal.aborted) setState("error"); });
    return () => abort.abort();
  }, [days, retry]);
  const m = data?.metrics;
  const value = (n: number | null | undefined, suffix = "") => n == null ? "—" : `${new Intl.NumberFormat(language === "am" ? "am-ET" : "en-ET", { maximumFractionDigits: 1 }).format(n)}${suffix}`;
  return <main className="nr-confidence-site nr-quality-page">
    <header className="nr-confidence-header"><Link className="nr-confidence-wordmark" href="/admin">NexRide</Link><BrandLanguageSwitch/><Link href="/admin" className="nr-confidence-text-link"><Icon name="back" size={16}/>{t("qualityBack")}</Link></header>
    <div className="nr-quality-body"><div className="nr-confidence-title"><span className="nr-confidence-eyebrow">{t("brandStandard")}</span><h1>{t("brandQuality")}</h1><p>{t("qualityIntro")}</p></div>
      <div className="nr-quality-toolbar"><select aria-label={t("qualityScope")} value={days} onChange={event => setDays(event.target.value)}><option value="7">{t("qualityWeek")}</option><option value="30">{t("qualityMonth")}</option></select><button type="button" disabled={state === "loading"} onClick={() => setRetry(n => n + 1)}>{t("qualityRefresh")}</button></div>
      {state === "loading" && <p role="status">{t("qualityLoading")}</p>}
      {state === "error" && <div className="nr-quality-error" role="alert"><p>{t("qualityUnavailable")}</p><Link href="/admin">{t("signIn")}</Link></div>}
      {data && m && <>
        <section className="nr-quality-scope"><h2>{t("qualityScope")}</h2><p>{t("qualityScopeNote")}</p><p>{t("qualityUpdated")}: {new Date(data.to).toLocaleString(language === "am" ? "am-ET" : "en-ET", { timeZone: "Africa/Addis_Ababa" })} · Addis Ababa</p><p>{t("qualityTotal")}: {value(data.totalRequests)} · {t("qualityRequests")}: {value(m.observedRequests)}</p></section>
        {data.sampled && <p className="nr-quality-warning" role="status">{t("qualitySampled")}</p>}
        {m.observedRequests === 0 && <p role="status" className="nr-quality-empty">{t("qualityEmpty")}</p>}
        <div className="nr-quality-metrics">
          <article><span>{t("qualityCompleted")}</span><strong>{value(m.completed)}</strong><small>{t("qualityRequests")}: {value(m.observedRequests)}</small></article>
          <article><span>{t("qualityClosed")}</span><strong>{value(m.closedCompletionPercent, "%")}</strong><small>{t("qualityClosedNote")}</small></article>
          <article><span>{t("qualityMatch")}</span><strong>{value(m.meanMatchSeconds)} <em>{m.meanMatchSeconds !== null && t("qualitySeconds")}</em></strong><small>{t("qualityMatchNote")} {t("qualitySamples")}: {value(m.matchedSamples)}</small></article>
          <article><span>{t("qualityRepeat")}</span><strong>{value(m.repeatCompletedRiders)}</strong><small>{t("qualityRepeatNote")}</small></article>
        </div>
        <section className="nr-quality-breakdown"><h2>{t("qualityCancellation")}</h2><dl>{([["qualityRiderCancel", m.riderCancellations], ["qualityDriverCancel", m.driverCancellations], ["qualityOtherCancel", m.unattributedCancellations], ["qualityWithdrawn", m.withdrawn]] as const).map(([label, count]) => <div key={label}><dt>{t(label)}</dt><dd>{value(count)}</dd></div>)}</dl></section>
      </>}
      <section className="nr-quality-gaps"><h2>{t("qualityGaps")}</h2><p>{t("qualityGapsNote")}</p><Link className="nr-confidence-inline" href="/admin/reliability">{t("brandServiceGuide")} · GPS & Android <Icon name="arrow" size={16}/></Link></section>
    </div>
  </main>;
}

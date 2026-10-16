"use client";

import Link from "next/link";
import { useContext } from "react";
import { Icon, LanguageContext, useTranslation, type IconName } from "./ui";
import { announceLanguage } from "./language-provider";

export function BrandLanguageSwitch() {
  const language = useContext(LanguageContext);
  const t = useTranslation();
  return <button className="nr-confidence-language" type="button" aria-label={t("language")}
    onClick={() => announceLanguage(language === "en" ? "am" : "en")}>
    {language === "en" ? "አማርኛ" : "English"}
  </button>;
}

export function StandardLink({ role = "rider" }: { role?: "rider" | "driver" }) {
  const t = useTranslation();
  return <Link className="nr-standard-link" href={role === "driver" ? "/driver/standard" : "/standard"}>
    <Icon name="shield" size={20}/><span><strong>{t("brandStandard")}</strong>
      <small>{t(role === "driver" ? "brandDriverGuideLink" : "brandGuideLink")}</small></span>
    <Icon name="chevron" size={16}/>
  </Link>;
}

export function BrandPrinciples() {
  const t = useTranslation();
  const principles = [
    ["brandPrecision", "brandPrecisionBody", "locate"],
    ["brandCare", "brandCareBody", "chat"],
    ["brandTrust", "brandTrustBody", "shield"],
    ["brandPride", "brandPrideBody", "pin"],
    ["brandConsistency", "brandConsistencyBody", "check"],
  ] as const;
  return <div className="nr-confidence-principles">{principles.map(([title, body, icon], index) =>
    <article key={title}><span className="nr-confidence-index">0{index + 1}</span><Icon name={icon as IconName} size={22}/>
      <h3>{t(title)}</h3><p>{t(body)}</p></article>)}</div>;
}

export function JourneyGuide() {
  const t = useTranslation();
  const stages = [["brandBeforeRide", "brandBeforeRideBody"], ["brandAtPickup", "brandAtPickupBody"], ["brandAfterRide", "brandAfterRideBody"]] as const;
  return <ol className="nr-confidence-journey">{stages.map(([title, body], index) =>
    <li key={title}><span>0{index + 1}</span><div><h3>{t(title)}</h3><p>{t(body)}</p></div></li>)}</ol>;
}

export function DriverServiceGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslation();
  return <section className="nr-service-guide">
    <h2>{t(compact ? "brandCheckBeforeOnline" : "brandDriverStandard")}</h2>
    {!compact && <p>{t("brandDriverStandardIntro")}</p>}
    <ul>{(["brandVehicleReady", "brandIdentityReady", "brandLocationReady", "brandRespectReady", "brandPrivacyReady"] as const).map(key =>
      <li key={key}><Icon name="check" size={18}/><span>{t(key)}</span></li>)}</ul>
    {!compact && <p>{t("brandFairReview")}</p>}
  </section>;
}

export function ServiceStandardPage({ role = "rider" }: { role?: "rider" | "driver" }) {
  const t = useTranslation();
  return <div className="nr-confidence-site">
    <header className="nr-confidence-header"><Link className="nr-confidence-wordmark" href={role === "driver" ? "/driver/home" : "/rider"}>NexRide</Link>
      <BrandLanguageSwitch/><Link className="nr-confidence-text-link" href={role === "driver" ? "/driver/home" : "/"}><Icon name="back" size={16}/>{t("home")}</Link></header>
    <main className="nr-standard-page">
      <section className="nr-confidence-title"><span className="nr-confidence-eyebrow">{t("brandStandard")}</span><h1>{t("brandConfidence")}</h1><p>{t("brandStandardIntro")}</p></section>
      <BrandPrinciples/>
      {role === "driver" ? <DriverServiceGuide/> : <><h2>{t("brandJourneyHeading")}</h2><JourneyGuide/></>}
      <div className="nr-confidence-notes"><section><Icon name="navigation" size={22}/><h2>{t("brandKnowRide")}</h2><p>{t("brandAvailabilityNote")}</p><p>{t("brandSafetyNote")}</p></section>
      <section><Icon name="star" size={22}/><h2>{t("brandBenefitsTitle")}</h2><p>{t("brandBenefitsBody")}</p></section></div>
      <div className="nr-confidence-actions"><Link className="nr-confidence-primary" href={role === "driver" ? "/support?role=driver" : "/support?role=rider"}>{t("help")}<Icon name="arrow" size={18}/></Link>
        <Link className="nr-confidence-secondary" href={role === "driver" ? "/driver/profile" : "/rider/trips"}>{t(role === "driver" ? "account" : "trips")}</Link></div>
    </main><footer className="nr-confidence-footer"><strong>NexRide</strong><p>{t("brandTagline")}</p><Link href="/explore/privacy">{t("entryPrivacy")}</Link></footer>
  </div>;
}

"use client";
import Image from "next/image";
import Link from "next/link";
import { Icon, useTranslation } from "./ui";
import { BrandLanguageSwitch, BrandPrinciples, JourneyGuide } from "./confidence";

export function BrandExperience() {
  const t = useTranslation();
  return <div className="nr-confidence-site" id="top">
    <a className="nr-confidence-skip" href="#brand-main">{t("brandExplore")}</a>
    <header className="nr-confidence-header"><Link className="nr-confidence-wordmark" href="/explore">NexRide</Link>
      <nav aria-label={t("brandExplore")}><Link href="/standard">{t("brandStandard")}</Link><Link href="/driver">{t("driver")}</Link><Link href="/download">{t("brandAppDownload")}</Link></nav>
      <BrandLanguageSwitch/><Link className="nr-confidence-header-action" href="/rider/sign-in">{t("signIn")}<Icon name="arrow" size={16}/></Link>
    </header>
    <main id="brand-main">
      <section className="nr-confidence-hero">
        <Image src="/images/addis-nexride-auth.webp" alt="" fill priority sizes="100vw" className="nr-confidence-city"/>
        <div className="nr-confidence-hero-copy"><span className="nr-confidence-eyebrow">{t("entryYourCity")}</span><h1>{t("brandWelcome")}</h1><p>{t("brandConfidence")}</p>
          <div className="nr-confidence-actions"><Link className="nr-confidence-primary" href="/rider">{t("brandBook")}<Icon name="arrow" size={20}/></Link><Link className="nr-confidence-secondary" href="/driver">{t("brandBecomeDriver")}</Link></div>
          <span className="nr-confidence-hero-note">{t("brandTagline")}</span>
        </div><div className="nr-confidence-place"><Icon name="pin" size={16}/>{t("city")}</div>
      </section>
      <section className="nr-confidence-section"><div className="nr-confidence-section-heading"><span className="nr-confidence-eyebrow">{t("brandStandard")}</span><h2>{t("brandConfidence")}</h2><p>{t("brandStandardIntro")}</p></div><BrandPrinciples/></section>
      <section className="nr-confidence-editorial"><div className="nr-confidence-editorial-image"><Image src="/images/addis-nexride-auth.webp" alt="" fill sizes="(max-width: 760px) 100vw, 50vw"/></div>
        <div><span className="nr-confidence-eyebrow">NEXRIDE · {t("rider")}</span><h2>{t("brandRiderHeading")}</h2><p>{t("brandRiderCopy")}</p><Link className="nr-confidence-inline" href="/rider">{t("brandBook")}<Icon name="arrow" size={18}/></Link></div></section>
      <section className="nr-confidence-section"><div className="nr-confidence-section-heading"><span className="nr-confidence-eyebrow">{t("brandKnowRide")}</span><h2>{t("brandJourneyHeading")}</h2></div><JourneyGuide/><Link className="nr-confidence-inline" href="/standard">{t("brandStandard")}<Icon name="arrow" size={18}/></Link></section>
      <section className="nr-confidence-driver"><div><span className="nr-confidence-eyebrow">NEXRIDE · {t("driver")}</span><h2>{t("entryDriveHeadline")}</h2><p>{t("brandDriverCopy")}</p><div className="nr-confidence-actions"><Link className="nr-confidence-primary" href="/driver">{t("brandBecomeDriver")}<Icon name="arrow" size={18}/></Link><Link className="nr-confidence-secondary" href="/driver/standard">{t("brandServiceGuide")}</Link></div></div><span className="nr-confidence-driver-type" aria-hidden="true">NexRide<span>Driver</span></span></section>
      <section className="nr-confidence-section nr-confidence-close"><span className="nr-confidence-eyebrow">{t("entryYourCity")}</span><h2>{t("brandReady")}</h2><div className="nr-confidence-actions"><Link className="nr-confidence-primary" href="/rider">{t("brandBook")}<Icon name="arrow" size={18}/></Link><Link className="nr-confidence-secondary" href="/download">{t("brandAppDownload")}</Link></div><p>{t("brandAvailabilityNote")}</p></section>
    </main>
    <footer className="nr-confidence-footer"><Link className="nr-confidence-wordmark" href="/explore">NexRide</Link><p>{t("brandTagline")}</p><nav><Link href="/standard">{t("brandStandard")}</Link><Link href="/support">{t("help")}</Link><Link href="/explore/privacy">{t("entryPrivacy")}</Link><Link href="/explore/terms">{t("entryTerms")}</Link></nav></footer>
  </div>;
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "./site-shell";
import "./style.css";

export const metadata: Metadata = {
  title: "Biloo — A Better Way to Move in Addis Ababa",
  description: "Discover Biloo: a connected ride-hailing experience for riders and drivers in Addis Ababa, Ethiopia. Explore the Rider app, Driver portal, and how Biloo works.",
  alternates: { canonical: "/explore" },
  openGraph: {
    title: "Biloo — Your city. Your way.",
    description: "Better rides. A brighter tomorrow. Discover Biloo Rider and Biloo Driver in Addis Ababa.",
    url: "/explore",
  },
};

const benefits = [
  { number: "01", icon: "↗", title: "A simpler way to go", text: "Plan your trip, choose a destination and request a ride from one clear experience." },
  { number: "02", icon: "◎", title: "Know your journey", text: "See the trip details available in your app, with useful updates along the way." },
  { number: "03", icon: "✳", title: "Built for both sides", text: "One connected platform with dedicated experiences for riders and drivers." },
];

const riderSteps = [
  { number: "01", title: "Set your destination", text: "Choose where you are and where you want to go." },
  { number: "02", title: "Request your ride", text: "Review the available option and send your request." },
  { number: "03", title: "Follow your journey", text: "Stay informed with available trip and driver details." },
];

const faqs = [
  { question: "How can I request a ride?", answer: "Open Biloo Rider, select your pickup and destination, review the available ride options, and request your trip." },
  { question: "Can I register as a driver?", answer: "Yes. Open the Biloo Driver portal to register and provide the required driver and vehicle details. Driver access depends on eligibility and verification." },
  { question: "Are the Android apps available to download?", answer: "The official download page shows current release availability. Signed Android APKs will be offered there after verification and publication." },
  { question: "Where does Biloo operate?", answer: "Biloo is focused on Addis Ababa. Actual availability depends on service coverage and drivers online in your area." },
];

function RideIllustration() {
  return (
    <div className="bl-visual-wrap" aria-label="Illustrative preview of a Biloo ride route in Addis Ababa">
      <div className="bl-orbit bl-orbit-one" aria-hidden="true" />
      <div className="bl-orbit bl-orbit-two" aria-hidden="true" />
      <div className="bl-phone">
        <div className="bl-phone-top"><span className="bl-phone-brand"><Image src="/brand/biloo-mark.svg" width={22} height={22} alt="" /> biloo</span><span className="bl-phone-menu" aria-hidden="true">☰</span></div>
        <div className="bl-map">
          <svg className="bl-map-lines" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <path className="bl-road" d="M-25 54 74 64 133 13 192 46 347 8M-20 111 80 126 178 93 337 126M-18 211 84 189 162 230 337 206M0 290 111 269 208 294 355 263" />
            <path className="bl-road" d="M36 -20 48 100 26 200 82 352M117 -30 113 78 139 168 110 355M226 -20 202 100 253 193 234 344M300 -15 277 116 294 244 269 345" />
            <path className="bl-route-shadow" d="M93 241 C104 192 145 206 153 171 S207 151 226 97" />
            <path className="bl-route" d="M93 241 C104 192 145 206 153 171 S207 151 226 97" />
            <circle cx="93" cy="241" r="11" fill="#08295F" stroke="#fff" strokeWidth="5" />
            <circle cx="226" cy="97" r="12" fill="#F9C449" stroke="#fff" strokeWidth="5" />
          </svg>
          <span className="bl-map-label bl-map-label-top">Bole</span>
          <span className="bl-map-label bl-map-label-bottom">Meskel Square</span>
          <span className="bl-map-rider-pin" aria-hidden="true">●</span>
        </div>
        <div className="bl-phone-panel">
          <span className="bl-panel-handle" aria-hidden="true" />
          <span className="bl-panel-overline">YOUR JOURNEY</span>
          <div className="bl-location-row"><span className="bl-location-icon origin" /><span>Pickup <strong>Meskel Square</strong></span></div>
          <div className="bl-location-divider" />
          <div className="bl-location-row"><span className="bl-location-icon destination" /><span>Destination <strong>Bole</strong></span></div>
          <div className="bl-phone-button">Find your ride <span>→</span></div>
        </div>
      </div>
      <div className="bl-floating-note bl-floating-note-top"><span className="bl-note-icon">✳</span><span><strong>Your journey</strong><small>Made a little simpler</small></span></div>
      <div className="bl-floating-note bl-floating-note-bottom"><span className="bl-note-route">↗</span><span><strong>Made for Addis</strong><small>Move on your terms</small></span></div>
      <span className="bl-illustration-disclaimer">Illustrative interface · Not live trip data</span>
    </div>
  );
}

export default function Explore() {
  return (
    <div className="marketing bl-site" id="top">
      <a className="bl-skip-link" href="#main-content">Skip to content</a>
      <MarketingHeader />
      <main id="main-content">
        <section className="bl-hero" aria-labelledby="bl-hero-heading">
          <div className="bl-container bl-hero-grid">
            <div className="bl-hero-copy">
              <div className="bl-eyebrow"><span className="bl-eyebrow-mark" /> INTRODUCING BILOO <span className="bl-eyebrow-rule" /></div>
              <h1 id="bl-hero-heading">Your city.<br />Your way<span className="bl-accent">.</span></h1>
              <p className="bl-lead">A better way to get around Addis Ababa. Thoughtfully designed for the people who ride and the people who drive.</p>
              <div className="bl-hero-actions">
                <Link className="bl-btn bl-btn-dark" href="/rider/sign-in">Find your ride <span aria-hidden="true">↗</span></Link>
                <Link className="bl-btn bl-btn-outline" href="/driver">Drive with Biloo <span aria-hidden="true">↗</span></Link>
              </div>
              <div className="bl-hero-caption"><span className="bl-caption-pips" aria-hidden="true"><i/><i/><i/></span> One platform. Two experiences. Built for Ethiopia.</div>
            </div>
            <RideIllustration />
          </div>
          <div className="bl-container bl-hero-bottom"><span>BETTER RIDES. A BRIGHTER TOMORROW.</span><a href="#why-biloo">Explore Biloo <span aria-hidden="true">↓</span></a></div>
        </section>

        <section className="bl-intro" id="why-biloo" aria-labelledby="bl-intro-title">
          <div className="bl-container">
            <div className="bl-section-header">
              <span className="bl-kicker">WHY BILOO</span>
              <div className="bl-section-head-grid"><h2 id="bl-intro-title">Everyday journeys.<br /><span>A better experience.</span></h2><p>We believe getting around should feel straightforward. From your first tap to your destination, Biloo brings riders and drivers together in one clear, considered experience.</p></div>
            </div>
            <div className="bl-benefits">
              {benefits.map((item) => <article className="bl-benefit" key={item.number}><div className="bl-benefit-top"><span>{item.number} / 03</span><span className="bl-benefit-symbol" aria-hidden="true">{item.icon}</span></div><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}
            </div>
          </div>
        </section>

        <section className="bl-rider-section" id="riders" aria-labelledby="bl-riders-title">
          <div className="bl-container bl-showcase-grid">
            <div className="bl-showcase-content">
              <span className="bl-kicker">01 / BILOO RIDER</span>
              <h2 id="bl-riders-title">The city is yours to explore<span className="bl-accent">.</span></h2>
              <p>From your everyday commute to spontaneous plans, Biloo Rider makes it easier to find a way forward.</p>
              <div className="bl-feature-lines"><span><b>01</b> Simple pickup and destination search</span><span><b>02</b> Available ride options in one place</span><span><b>03</b> Helpful trip information along the way</span></div>
              <Link className="bl-text-link" href="/rider/sign-in">Explore Biloo Rider <span aria-hidden="true">↗</span></Link>
            </div>
            <div className="bl-app-showcase bl-rider-art" aria-label="Biloo Rider product illustration">
              <div className="bl-showcase-gridlines" aria-hidden="true" />
              <div className="bl-product-tile">
                <div className="bl-product-icon"><Image src="/brand/biloo-rider.svg" width={76} height={76} alt="" /></div>
                <span>BILOO RIDER</span>
                <strong>Where to today?</strong>
                <div className="bl-product-input"><i /> Choose a destination <span aria-hidden="true">↗</span></div>
                <div className="bl-product-pills"><span>Home</span><span>Work</span><span>Saved</span></div>
              </div>
              <span className="bl-showcase-corner">MOVE FREELY ↗</span>
            </div>
          </div>
        </section>

        <section className="bl-driver-section" id="drivers" aria-labelledby="bl-drivers-title">
          <div className="bl-container bl-showcase-grid">
            <div className="bl-app-showcase bl-driver-art" aria-label="Biloo Driver product illustration">
              <div className="bl-driver-glow" aria-hidden="true" />
              <div className="bl-product-tile bl-driver-tile">
                <div className="bl-product-icon"><Image src="/brand/biloo-driver.svg" width={76} height={76} alt="" /></div>
                <span>BILOO DRIVER</span>
                <strong>Drive. Earn. Grow.</strong>
                <p>Designed around your day.</p>
                <div className="bl-driver-status"><i /> Manage availability <span>→</span></div>
              </div>
              <span className="bl-showcase-corner">YOUR ROAD. YOUR CHOICE. ↗</span>
            </div>
            <div className="bl-showcase-content">
              <span className="bl-kicker bl-gold-kicker">02 / BILOO DRIVER</span>
              <h2 id="bl-drivers-title">Your drive.<br />Your next opportunity<span className="bl-gold">.</span></h2>
              <p>Built for the people who keep the city moving. Register, complete the required checks, and manage your driving activity from a dedicated experience.</p>
              <div className="bl-feature-lines"><span><b>01</b> Dedicated driver registration</span><span><b>02</b> Clear eligibility and account steps</span><span><b>03</b> Requests and activity in one place</span></div>
              <Link className="bl-btn bl-btn-gold" href="/driver">Become a Biloo Driver <span aria-hidden="true">↗</span></Link>
            </div>
          </div>
        </section>

        <section className="bl-process" aria-labelledby="bl-process-title">
          <div className="bl-container">
            <div className="bl-section-header bl-centered"><span className="bl-kicker">SIMPLY BETTER</span><h2 id="bl-process-title">Three steps. You're on your way.</h2><p>Getting started with Biloo Rider is straightforward.</p></div>
            <div className="bl-process-grid">
              {riderSteps.map((item) => <article key={item.number} className="bl-process-item"><span className="bl-process-number">{item.number}</span><div className="bl-process-rule" aria-hidden="true" /><h3>{item.title}</h3><p>{item.text}</p></article>)}
            </div>
            <div className="bl-process-action"><Link className="bl-btn bl-btn-dark" href="/download#rider">See app options <span aria-hidden="true">↗</span></Link></div>
          </div>
        </section>

        <section className="bl-safety-strip" aria-labelledby="bl-safety-title"><div className="bl-container bl-safety-content"><span className="bl-safety-symbol" aria-hidden="true">✳</span><div><span className="bl-kicker">PEOPLE FIRST</span><h2 id="bl-safety-title">Confidence starts with clarity.</h2><p>Know what to expect with trip information, account controls, and access to available help and reporting features.</p></div><Link className="bl-text-link" href="/explore/safety">Our approach to safety <span aria-hidden="true">↗</span></Link></div></section>

        <section className="bl-faq" aria-labelledby="bl-faq-title"><div className="bl-container bl-faq-grid"><div><span className="bl-kicker">GOOD TO KNOW</span><h2 id="bl-faq-title">A few things<br />worth knowing.</h2><p>Have more questions? Our helpful information pages are a good place to start.</p><Link className="bl-text-link" href="/explore/faq">All FAQs <span aria-hidden="true">↗</span></Link></div><div className="bl-faq-list">{faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}</div></div></section>

        <section className="bl-final-cta" aria-labelledby="bl-final-title"><div className="bl-container"><span className="bl-kicker bl-gold-kicker">LET'S GET MOVING</span><h2 id="bl-final-title">The next move<br />is yours<span className="bl-gold">.</span></h2><p>A better journey begins with a single step.</p><div className="bl-hero-actions"><Link className="bl-btn bl-btn-gold" href="/rider/sign-in">Ride with Biloo <span aria-hidden="true">↗</span></Link><Link className="bl-btn bl-btn-light-outline" href="/driver">Drive with Biloo <span aria-hidden="true">↗</span></Link></div><span className="bl-final-watermark" aria-hidden="true">biloo.</span></div></section>
      </main>
      <MarketingFooter />
    </div>
  );
}

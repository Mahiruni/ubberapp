import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingHeader, MarketingFooter } from "../site-shell";
import "../style.css";

const content = {
  safety: { title: "Moving with confidence.", subtitle: "Practical tools for better-informed journeys.", label: "YOUR JOURNEY", items: [["Trip information", "Review available trip and driver information before and during your journey."], ["Account security", "Protect your account and use trusted sign-in methods."], ["Help when needed", "Use available support and reporting channels when you need assistance."]] },
  about: { title: "A brighter way to move.", subtitle: "Made for the way Addis Ababa moves.", label: "ABOUT BILOO", items: [["Our mission", "Make everyday mobility more convenient, understandable, and accessible."], ["Designed for Addis", "Built around the needs of local riders and drivers."], ["Building responsibly", "Improving our product while respecting privacy, safety, and accessibility."]] },
  faq: { title: "Good questions. Clear answers.", subtitle: "The essentials about riding and driving with Biloo.", label: "FREQUENTLY ASKED QUESTIONS", items: [["How do I request a ride?", "Open Biloo Rider, set your pickup and destination, select an available option and request a trip."], ["How do I become a driver?", "Open Biloo Driver, register, provide required driver and vehicle details, and complete eligibility checks."], ["Where are the APKs?", "Official Android APK downloads will be enabled after verified releases are published."], ["Where is Biloo available?", "Biloo is focused on Addis Ababa. Actual ride availability depends on operational coverage and online drivers."]] },
  contact: { title: "We're here to help.", subtitle: "Find the right support experience.", label: "CONTACT BILOO", items: [["Rider support", "Sign in to the Rider app to access available help and trip information."], ["Driver support", "Open the Driver app for account and trip assistance."], ["General questions", "Review the frequently asked questions for product and download guidance."]] },
  "how-it-works": { title: "Easy from the first step.", subtitle: "Two experiences. One connected platform.", label: "HOW IT WORKS", items: [["For riders", "Set your pickup and destination, choose an available ride, request it, and follow the journey."], ["For drivers", "Register, complete verification, go online, review incoming requests, and manage trips."], ["For everyone", "Keep your account information up to date and use official Biloo applications."]] },
  privacy: { title: "Privacy matters.", subtitle: "An overview of how information may be used for ride services.", label: "PRIVACY INFORMATION", items: [["Your information", "Account, location, and trip information may be processed to operate the ride service."], ["Your choices", "Use account settings and available support channels for privacy requests."], ["Important notice", "This is a general overview, not a substitute for an approved, jurisdiction-specific privacy policy."]] },
  terms: { title: "Using Biloo responsibly.", subtitle: "Important information about participating in the platform.", label: "TERMS OVERVIEW", items: [["Eligibility", "Rider and Driver use may be subject to account and verification requirements."], ["Responsible use", "Provide accurate details and follow applicable laws and safety guidance."], ["Important notice", "This is an informational overview. A legally reviewed terms of service must be published before relying on it as a binding agreement."]] },
} as const;

type Slug = keyof typeof content;

export function generateStaticParams() {
  return Object.keys(content).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{slug: string}> }): Promise<Metadata> {
  const { slug } = await params;
  const item = content[slug as Slug];
  return {
    title: item ? item.title + " | Biloo" : "Biloo",
    description: item?.subtitle,
    alternates: item ? { canonical: "/explore/" + slug } : undefined,
  };
}

export default async function MarketingInfoPage({ params }: { params: Promise<{slug: string}> }) {
  const { slug } = await params;
  const item = content[slug as Slug];
  if (!item) notFound();
  return (
    <div className="marketing bl-site" id="top">
      <a className="bl-skip-link" href="#main-content">Skip to content</a>
      <MarketingHeader />
      <main id="main-content">
        <section className="bl-info-hero">
          <div className="bl-container">
            <span className="bl-kicker">{item.label}</span>
            <h1>{item.title}</h1>
            <p>{item.subtitle}</p>
          </div>
        </section>
        <section className="bl-info-cards">
          <div className="bl-container bl-info-grid">
            {item.items.map(([title, body], index) => (
              <article key={title} className="bl-info-card">
                <span className="bl-info-card-number">{String(index + 1).padStart(2, "0")} / {String(item.items.length).padStart(2, "0")}</span>
                <h2>{title}</h2>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="bl-info-cta"><div className="bl-container"><h2>Ready to move forward?</h2><Link className="bl-btn bl-btn-dark" href="/download">Explore the Biloo apps <span aria-hidden="true">↗</span></Link></div></section>
      </main>
      <MarketingFooter />
    </div>
  );
}

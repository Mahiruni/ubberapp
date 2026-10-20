import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "../explore/site-shell";
import "../explore/style.css";

export const metadata: Metadata = {
  title: "Biloo Rider & Driver Apps | Biloo",
  description: "Access the official Biloo Rider and Biloo Driver web experiences and see verified Android app release availability.",
  alternates: { canonical: "/download" },
};

const applications = [
  { id: "rider", title: "Biloo Rider", description: "Explore your city. Search destinations, request available rides, and follow your journey.", image: "/brand/biloo-rider.svg", href: "/rider/sign-in", action: "Open Rider web app" },
  { id: "driver", title: "Biloo Driver", description: "Get started with driver registration and access the dedicated driving experience.", image: "/brand/biloo-driver.svg", href: "/driver", action: "Open Driver portal" },
];

export default function Download() {
  return (
    <div className="marketing bl-site" id="top">
      <a className="bl-skip-link" href="#main-content">Skip to content</a>
      <MarketingHeader />
      <main id="main-content">
        <section className="bl-info-hero">
          <div className="bl-container">
            <span className="bl-kicker">BILOO APPS</span>
            <h1>One platform.<br />Two ways to move<span className="bl-accent">.</span></h1>
            <p>Find the experience that's right for you. The web apps are available below; Android downloads will appear when signed releases are published.</p>
          </div>
        </section>
        <section className="bl-info-cards">
          <div className="bl-container bl-download-grid">
            {applications.map((app) => (
              <article className="bl-download-card" id={app.id} key={app.id}>
                <div className="bl-download-card-icon"><Image src={app.image} alt={app.title + " logo"} width={76} height={76} /></div>
                <h2>{app.title}</h2>
                <p>{app.description}</p>
                <div className="bl-release-status"><i aria-hidden="true" /> Android APK not yet published</div>
                <Link className="bl-btn bl-btn-dark" href={app.href}>{app.action} <span aria-hidden="true">↗</span></Link>
              </article>
            ))}
          </div>
        </section>
        <section className="bl-download-note"><div className="bl-container"><h2>Install with confidence.</h2><p>Only download Android packages from official Biloo channels after their release is confirmed. Do not install an APK from an unknown sender or disable Android's security protections to proceed.</p></div></section>
      </main>
      <MarketingFooter />
    </div>
  );
}

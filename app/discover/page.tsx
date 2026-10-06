import Link from "next/link";
import { Icon } from "../../components/nexride/ui";
import "../nexride.css";
import "./discover.css";

const values = [
  {
    icon: "shield" as const,
    title: "Safe",
    text: "Safety tools, trip sharing, and clear driver details stay within reach.",
  },
  {
    icon: "clock" as const,
    title: "Fast",
    text: "A focused booking flow keeps the next action clear.",
  },
  {
    icon: "money" as const,
    title: "Transparent",
    text: "Routes, fares, payment states, and trip statuses are labeled clearly.",
  },
  {
    icon: "star" as const,
    title: "Premium",
    text: "A calm, considered experience from pickup to arrival.",
  },
  {
    icon: "pin" as const,
    title: "Local",
    text: "Built around Addis Ababa places and everyday movement.",
  },
];

export default function DiscoverNexRidePage() {
  return (
    <main className="nr-app nr-promo-page" data-theme="dark">
      <header className="nr-promo-topbar">
        <Link className="nr-promo-brand" href="/" aria-label="NexRide home">
          <span className="nr-promo-mark" aria-hidden="true">N</span>
          <span>
            <strong>NexRide</strong>
            <small>Better Rides. A Brighter Tomorrow.</small>
          </span>
        </Link>
        <nav aria-label="Discover NexRide">
          <Link href="/">Rider</Link>
          <Link href="/driver">Driver</Link>
        </nav>
      </header>

      <section className="nr-promo-hero" aria-labelledby="nr-promo-title">
        <div className="nr-promo-hero-copy">
          <span className="nr-promo-eyebrow">NEXRIDE · ADDIS ABABA</span>
          <div className="nr-promo-lockup">
            <span className="nr-promo-mark large" aria-hidden="true">N</span>
            <div>
              <strong>NexRide</strong>
              <small>Better Rides. A Brighter Tomorrow.</small>
            </div>
          </div>
          <h1 id="nr-promo-title">More than a ride.<br />A better way to move.</h1>
          <p>
            Clear trip information, thoughtful safety tools, and a simpler connection between riders and drivers.
          </p>
          <div className="nr-promo-actions">
            <Link className="nr-promo-primary" href="/">Book a ride <Icon name="arrow" size={17} /></Link>
            <Link className="nr-promo-secondary" href="/driver">Drive with NexRide</Link>
          </div>
          <div className="nr-promo-app-note">
            <Icon name="info" size={16} />
            <span>NexRide is not currently published in the App Store or Google Play. Use the web app for now.</span>
          </div>
        </div>
        <div className="nr-promo-hero-visual nr-promo-addis-night" role="img" aria-label="Addis Ababa skyline">
          <div className="nr-promo-photo-tag">
            <span>Addis Ababa</span>
            <strong>Built for the way Addis moves.</strong>
          </div>
        </div>
      </section>

      <section className="nr-promo-values" aria-labelledby="nr-values-title">
        <div className="nr-promo-section-heading">
          <span>WHAT GUIDES NEXRIDE</span>
          <h2 id="nr-values-title">Designed around what matters on every ride.</h2>
        </div>
        <div className="nr-promo-value-grid">
          {values.map((value) => (
            <article className="nr-promo-value" key={value.title}>
              <span className="nr-promo-value-icon"><Icon name={value.icon} size={20} /></span>
              <div>
                <h3>{value.title}</h3>
                <p>{value.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="nr-promo-photo-panel nr-promo-skyline" aria-labelledby="nr-skyline-title">
        <div className="nr-promo-photo-copy">
          <span>ROOTED HERE</span>
          <h2 id="nr-skyline-title">Addis Ababa and beyond.</h2>
          <p>
            Built in Addis with room to grow. Service is shown only where NexRide currently supports booking.
          </p>
        </div>
      </section>

      <section className="nr-promo-split nr-promo-driver">
        <div className="nr-promo-driver-visual" aria-hidden="true">
          <div className="nr-promo-driver-lockup">
            <span className="nr-promo-mark large">N</span>
            <div>
              <strong>NexRide Driver</strong>
              <small>Verified access · clear trips · organized earnings</small>
            </div>
          </div>
          <div className="nr-promo-driver-grid">
            <span><Icon name="shield" size={20} /> Verification</span>
            <span><Icon name="pin" size={20} /> Trip guidance</span>
            <span><Icon name="clock" size={20} /> Availability</span>
          </div>
        </div>
        <div className="nr-promo-split-copy">
          <span className="nr-promo-eyebrow">NEXRIDE · DRIVER</span>
          <h2>Drive. Earn. Grow.</h2>
          <p>
            Complete verification, go online when approved, and keep trips and earnings organized. Earnings depend on completed rides and actual demand; NexRide does not guarantee income.
          </p>
          <Link className="nr-promo-primary" href="/driver">Become a driver <Icon name="arrow" size={17} /></Link>
        </div>
      </section>

      <section className="nr-promo-photo-panel nr-promo-people" aria-labelledby="nr-people-title">
        <div className="nr-promo-photo-copy wide">
          <span>PEOPLE FIRST</span>
          <h2 id="nr-people-title">Real people. Real journeys.</h2>
          <p>Clear communication at every stage of the ride.</p>
          <small>
            NexRide is designed around everyday movement while keeping private trip and account data out of marketing content.
          </small>
        </div>
      </section>

      <section className="nr-promo-service-note">
        <span><Icon name="pin" size={20} /></span>
        <div>
          <strong>Clear about what’s available.</strong>
          <p>
            Availability, pricing, and driver assignment come from current product data. NexRide does not invent coverage, earnings, or safety guarantees.
          </p>
        </div>
      </section>

      <footer className="nr-promo-footer">
        <div className="nr-promo-footer-main">
          <Link className="nr-promo-brand" href="/">
            <span className="nr-promo-mark" aria-hidden="true">N</span>
            <span>
              <strong>NexRide</strong>
              <small>Better Rides. A Brighter Tomorrow.</small>
            </span>
          </Link>
          <div className="nr-promo-footer-values" aria-label="NexRide values">
            {values.map((value) => (
              <span key={value.title} title={value.title}>
                <Icon name={value.icon} size={17} />
                <small>{value.title}</small>
              </span>
            ))}
          </div>
        </div>

        <nav className="nr-promo-credits" aria-label="NexRide footer navigation">
          <Link href="/">Rider</Link>
          <Link href="/driver">Driver</Link>
          <Link href="/safety?role=rider">Safety</Link>
          <Link href="/support?role=rider">Support</Link>
          <span>Built for the way Ethiopia moves.</span>
        </nav>

        <div className="nr-promo-credits">
          <span>Photography:</span>
          <a href="https://unsplash.com/photos/a-city-street-with-tall-buildings-and-people-TDHU6EZQrsE" target="_blank" rel="noreferrer">Vatroslav Bank / Unsplash</a>
          <a href="https://commons.wikimedia.org/wiki/File:Addis_Ababa_skyline.jpg" target="_blank" rel="noreferrer">Simfan34 / Wikimedia Commons · CC BY-SA 3.0</a>
        </div>
      </footer>
    </main>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const navigation = [
  { label: "Why Biloo", href: "/explore#why-biloo" },
  { label: "Riders", href: "/explore#riders" },
  { label: "Drivers", href: "/explore#drivers" },
  { label: "Safety", href: "/explore/safety" },
  { label: "About", href: "/explore/about" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header className="bl-header">
        <div className="bl-container bl-header-inner">
          <Link className="bl-brand" href="/explore" aria-label="Biloo marketing homepage" onClick={() => setOpen(false)}>
            <Image src="/brand/biloo-mark.svg" alt="" width={40} height={40} priority />
            <span>biloo<span className="bl-brand-dot">.</span></span>
          </Link>
          <nav className="bl-desktop-nav" aria-label="Main navigation">
            {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          </nav>
          <div className="bl-header-actions">
            <Link className="bl-header-signin" href="/rider/sign-in">Sign in</Link>
            <Link className="bl-btn bl-btn-dark bl-header-cta" href="/download">Get the app <span aria-hidden="true">↗</span></Link>
          </div>
          <button className="bl-menu-trigger" type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="biloo-mobile-menu" onClick={() => setOpen(!open)}>
            <span className={open ? "bl-menu-icon bl-menu-icon-open" : "bl-menu-icon"} aria-hidden="true"><i/><i/></span>
          </button>
        </div>
      </header>
      {open && <button className="bl-menu-scrim" tabIndex={-1} aria-label="Close menu" onClick={() => setOpen(false)} />}
      <nav id="biloo-mobile-menu" className={"bl-mobile-menu" + (open ? " is-open" : "")} aria-label="Mobile navigation" aria-hidden={!open} inert={!open}>
        <div className="bl-mobile-menu-links">
          {navigation.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}<span aria-hidden="true">↗</span></Link>)}
          <Link href="/download" onClick={() => setOpen(false)}>Download apps <span aria-hidden="true">↗</span></Link>
          <Link href="/rider/sign-in" onClick={() => setOpen(false)}>Rider sign in <span aria-hidden="true">↗</span></Link>
          <Link href="/driver" onClick={() => setOpen(false)}>Driver portal <span aria-hidden="true">↗</span></Link>
        </div>
        <p>Better rides. A brighter tomorrow.</p>
      </nav>
    </>
  );
}

export function MarketingFooter() {
  const groups = [
    { title: "Discover", links: [["Why Biloo", "/explore#why-biloo"], ["About", "/explore/about"], ["How it works", "/explore/how-it-works"], ["Safety", "/explore/safety"]] },
    { title: "Ride & drive", links: [["Rider app", "/download#rider"], ["Driver app", "/download#driver"], ["Rider sign in", "/rider/sign-in"], ["Driver portal", "/driver"]] },
    { title: "Support", links: [["FAQ", "/explore/faq"], ["Contact", "/explore/contact"], ["Privacy overview", "/explore/privacy"], ["Terms overview", "/explore/terms"]] },
  ];
  return (
    <footer className="bl-footer">
      <div className="bl-container">
        <div className="bl-footer-grid">
          <div className="bl-footer-brand">
            <Link className="bl-brand" href="/explore"><Image src="/brand/biloo-mark.svg" width={40} height={40} alt="" /><span>biloo<span className="bl-brand-dot">.</span></span></Link>
            <p>Better rides.<br />A brighter tomorrow.</p>
            <span className="bl-footer-location">Made for the way Addis Ababa moves.</span>
          </div>
          {groups.map((group) => (
            <div className="bl-footer-column" key={group.title}>
              <h2>{group.title}</h2>
              {group.links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
            </div>
          ))}
        </div>
        <div className="bl-footer-bottom"><span>© {new Date().getFullYear()} Biloo. All rights reserved.</span><a href="#top">Back to top ↑</a></div>
      </div>
    </footer>
  );
}

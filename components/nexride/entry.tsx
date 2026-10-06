"use client";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { Brand, Button, LanguageContext } from "./ui";
import type { Language } from "../../lib/nexride-i18n";
import { LANGUAGE_KEY, storedLanguage } from "../../lib/nexride-startup";
import "./splash.css";

export function EntryShell({
  children,
  photoCredit = false,
  authMode,
}: {
  children: ReactNode;
  photoCredit?: boolean;
  authMode?: "signin" | "signup" | "forgot" | "reset";
}) {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    try {
      const saved = storedLanguage(localStorage);
      setLanguage(saved);
      document.documentElement.lang = saved;
    } catch {}
  }, []);

  return (
    <LanguageContext value={language}>
      <main
        className="nr-app nr-auth-experience"
        data-mode="rider"
        data-theme="light"
        data-auth-mode={authMode}
      >
        <div className="nr-auth-page">
          <section className="nr-auth-shell nr-auth-shell-rider">
            <div className="nr-auth-hero" aria-hidden="true">
              <Image
                src="/images/addis-splash-city.jpg"
                alt=""
                fill
                priority
                sizes="(max-width: 760px) 100vw, 760px"
                quality={86}
              />
              <div className="nr-auth-hero-wash" />
              <div className="nr-auth-hero-top">
                <Brand />
                <span className="nr-auth-role-tab">Rider</span>
              </div>
              <div className="nr-auth-hero-copy">
                <span>ADDIS ABABA · NEXRIDE</span>
                <strong>Better Rides.<br />A Brighter Tomorrow.</strong>
              </div>
                </div>

            <div className="nr-auth-content">
              <div className="nr-entry-language">
                <Button
                  variant="ghost"
                  onClick={() => {
                    const next = language === "en" ? "am" : "en";
                    setLanguage(next);
                    document.documentElement.lang = next;
                    try {
                      localStorage.setItem(LANGUAGE_KEY, next);
                    } catch {}
                  }}
                >
                  {language === "en" ? "አማርኛ" : "English"}
                </Button>
              </div>
              {children}
              {photoCredit && <PhotoCredit />}
            </div>
          </section>
        </div>
      </main>
    </LanguageContext>
  );
}

export function EntryPhoto() {
  return (
    <div className="nr-entry-photo">
      <Image
        src="/images/addis-splash-city.jpg"
        alt="Addis Ababa skyline from Sheger Park"
        fill
        sizes="440px"
        quality={85}
      />
    </div>
  );
}

export function PhotoCredit() {
  return (
    <small className="nr-entry-credit">
      Photo:{" "}
      <a
        href="https://commons.wikimedia.org/wiki/File:AddisView.jpg"
        target="_blank"
        rel="noreferrer"
      >
        DaneyWiki
      </a>{" "}
      ·{" "}
      <a
        href="https://creativecommons.org/licenses/by-sa/4.0/"
        target="_blank"
        rel="noreferrer"
      >
        CC BY-SA 4.0
      </a>
    </small>
  );
}

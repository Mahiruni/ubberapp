"use client";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { Brand, Button, LanguageContext } from "./ui";
import type { Language } from "../../lib/nexride-i18n";
import { LANGUAGE_KEY, storedLanguage } from "../../lib/nexride-startup";
import "./splash.css";

export function EntryShell({
  children,
  authMode,
}: {
  children: ReactNode;
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
              <div className="nr-auth-hero-wash" />
              <div className="nr-auth-hero-top">
                <Brand />
                <span className="nr-auth-role-tab">Rider</span>
              </div>
              <div className="nr-auth-hero-copy">
                <span>ADDIS ABABA · NEXRIDE</span>
                <strong>Better Rides.<br />A Brighter Tomorrow.</strong>
                <div className="nr-auth-hero-points">
                  <span>Quick account setup</span>
                  <span>Saved places</span>
                  <span>Trip history</span>
                </div>
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
        src="/images/addis-nexride-auth.webp"
        alt="Addis Ababa city skyline and boulevard"
        fill
        sizes="440px"
        quality={85}
      />
    </div>
  );
}

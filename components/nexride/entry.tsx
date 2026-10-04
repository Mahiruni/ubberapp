"use client";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { Brand, Button, LanguageContext } from "./ui";
import type { Language } from "../../lib/nexride-i18n";
import { LANGUAGE_KEY, storedLanguage } from "../../lib/nexride-startup";
import "./splash.css";
export function EntryShell({ children }: { children: ReactNode }) {
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
      <main className="nr-app" data-mode="rider" data-theme="dark">
        <div className="nr-entry-page">
          <section className="nr-entry-card">
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
            <Brand />
            {children}
            <PhotoCredit />
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

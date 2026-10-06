"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LanguageContext } from "./ui";
import { LANGUAGE_KEY, storedLanguage } from "../../lib/nexride-startup";
import type { Language } from "../../lib/nexride-i18n";

export const LANGUAGE_EVENT = "nexride:language-change";

export function announceLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {}
  window.dispatchEvent(new CustomEvent<Language>(LANGUAGE_EVENT, { detail: language }));
}

export function NexRideLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    try {
      setLanguage(storedLanguage(localStorage));
    } catch {}

    const onLanguage = (event: Event) => {
      const detail = (event as CustomEvent<Language>).detail;
      if (detail === "en" || detail === "am") setLanguage(detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_KEY) setLanguage(event.newValue === "am" ? "am" : "en");
    };

    window.addEventListener(LANGUAGE_EVENT, onLanguage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, onLanguage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <LanguageContext value={language}>{children}</LanguageContext>;
}

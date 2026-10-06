"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LanguageContext } from "./ui";
import { LANGUAGE_KEY } from "../../lib/nexride-startup";
import type { Language } from "../../lib/nexride-i18n";

export function NexRideLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY);
      if (stored === "am" || stored === "en") setLanguage(stored);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <LanguageContext value={language}>{children}</LanguageContext>;
}

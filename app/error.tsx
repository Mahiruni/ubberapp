"use client";
import { useEffect, useState } from "react";
import { Button, Brand, LanguageContext } from "../components/nexride/ui";
import { translate, type Language, type MessageKey } from "../lib/nexride-i18n";
import "./nexride.css";
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    setLanguage(document.documentElement.lang === "am" ? "am" : "en");
  }, []);
  const t = (key: MessageKey) => translate(language, key);
  return (
    <LanguageContext value={language}>
      <main className="nr-app">
        <section className="nr-error-page">
          <Brand />
          <h1>{t("temporaryError")}</h1>
          <p>{t("reopen")}</p>
          <Button onClick={reset}>{t("tryAgain")}</Button>
          <Button
            variant="secondary"
            onClick={() => window.location.assign("/")}
          >
            {t("skip")}
          </Button>
        </section>
      </main>
    </LanguageContext>
  );
}

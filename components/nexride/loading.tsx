"use client";
import { useTranslation } from "./ui";

export function BrandedLoader({ label }: { label?: string }) {
  const t = useTranslation();
  return (
    <main className="nr-branded-loader" aria-busy="true">
      <div className="nr-loader-lockup">
        <strong>NexRide</strong>
        <p className="nr-loader-tagline">{t("brandTagline")}</p>
        <div className="nr-loader-line" aria-hidden="true">
          <span />
        </div>
        <span className="nr-sr-only" role="status" aria-live="polite">
          {label || t("startupRestoring")}
        </span>
      </div>
    </main>
  );
}

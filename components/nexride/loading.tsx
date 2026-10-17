"use client";
import { useTranslation } from "./ui";

export function BrandedLoader({ label }: { label?: string }) {
  const t = useTranslation();
  return (
    <main className="nr-branded-loader" aria-busy="true" data-nr-startup-pending="true">
      <div className="nr-loader-lockup">
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

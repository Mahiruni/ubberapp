"use client";
import Image from "next/image";
import { Button, Icon, useTranslation } from "./ui";
import type { StartupError } from "../../lib/nexride-startup";
import "./splash.css";

export function RiderSplash({
  error,
  onRetry,
  onReset,
  animate = true,
}: {
  error?: StartupError | null;
  onRetry?: () => void;
  onReset?: () => void;
  animate?: boolean;
}) {
  const t = useTranslation();
  return (
    <section
      className={`nr-rider-splash ${animate ? "is-opening" : ""}`}
      aria-label="NexRide"
      aria-busy={!error}
    >
      <div className="nr-splash-ambient" aria-hidden="true" />
      <div className="nr-splash-identity">
        <Image
          className="nr-splash-mark"
          src="/brand/nexride-mark.svg"
          alt=""
          width={104}
          height={104}
          preload
          unoptimized
          aria-hidden="true"
        />
        <h1 className="nr-splash-wordmark">NexRide</h1>
        <p className="nr-splash-tagline">{t("brandTagline")}</p>
        {error ? (
          <div className="nr-splash-error" role="alert">
            <Icon name="info" />
            <h2>{t("startupError")}</h2>
            <p>
              {t(
                error.kind === "preferences"
                  ? "startupPreferencesError"
                  : "startupSessionError",
              )}
            </p>
            <Button onClick={onRetry}>{t("tryAgain")}</Button>
            {error.kind === "preferences" && (
              <Button variant="ghost" onClick={onReset}>
                {t("startupReset")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="nr-splash-progress" aria-hidden="true">
              <span />
            </div>
            <p className="nr-splash-status" role="status" aria-live="polite">
              {t("startupRestoring")}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

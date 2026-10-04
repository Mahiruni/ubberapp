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
      <div className="nr-splash-city">
        <Image
          src="/images/addis-splash-city.jpg"
          alt="Addis Ababa skyline from Sheger Park"
          fill
          preload
          sizes="100vw"
          quality={85}
        />
      </div>
      <div className="nr-splash-blend" />
      <div className="nr-splash-identity">
        <Image
          className="nr-splash-mark"
          src="/brand/provisional/nexride-folded-n.svg"
          alt="NexRide provisional symbol"
          width={104}
          height={91}
          preload
          unoptimized
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
          <p className="nr-splash-status" role="status">
            {t("startupRestoring")}
          </p>
        )}
      </div>
    </section>
  );
}

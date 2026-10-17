"use client";
import Link from "next/link";
import { Button, Icon, useTranslation } from "./ui";
import type { StartupError } from "../../lib/nexride-startup";
import "./splash.css";

/**
 * Session restoration is not another branded app introduction.
 * Android already provides the native launch splash. This shared screen is
 * deliberately a neutral waiting state while the existing session and role
 * checks finish; full error recovery remains available if restoration fails.
 */
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
      className={`nr-rider-splash ${error ? "has-error" : "is-restoring"} ${error && animate ? "is-opening" : ""}`}
      aria-label="NexRide"
      aria-busy={!error}
      data-nr-startup-pending={error ? undefined : "true"}
    >
      {error ? (
        <div className="nr-splash-identity">
          <h1 className="nr-splash-wordmark">NexRide</h1>
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
            {error.kind === "session" && (
              <nav className="nr-splash-recovery-links" aria-label="NexRide account access">
                <Link href="/rider/sign-in">{t("signIn")}</Link>
                <Link href="/rider">{t("startupOpenRiderWelcome")}</Link>
              </nav>
            )}
          </div>
        </div>
      ) : (
        <div className="nr-splash-restoring" role="status" aria-live="polite">
          <span className="nr-splash-loading-indicator" aria-hidden="true" />
          <span className="nr-splash-visually-hidden">{t("startupRestoring")}</span>
        </div>
      )}
    </section>
  );
}

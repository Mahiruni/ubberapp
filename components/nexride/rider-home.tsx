"use client";
import { Icon, ListRow, useTranslation } from "./ui";
import { placeKey, placeName, locality } from "../../lib/nexride-search";
import { useContext } from "react";
import { LanguageContext } from "./ui";
import { type Place } from "../../lib/nexride-places";
import type { HomePlaces } from "../../lib/nexride-home";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";
export function LocationMessage({
  status,
  position,
}: {
  status: LocationStatus;
  position: RiderLocation | null;
}) {
  const t = useTranslation();
  return (
    <div className={`nr-home-location ${status}`} role="status">
      <Icon
        name={
          status === "denied" || status === "unavailable" ? "info" : "locate"
        }
        size={16}
      />
      <span>
        {t(
          status === "loading"
            ? "locating"
            : status === "denied"
              ? "locationPermissionDenied"
              : status === "unavailable"
                ? "locationUnavailable"
                : status === "ready"
                  ? "locationReady"
                  : "locationPrompt",
        )}
        {status === "ready" && position && (
          <small>
            {t("accuracy")} ±{Math.ceil(position.accuracy)} m
          </small>
        )}
      </span>
    </div>
  );
}
export function RiderHomePanel({
  navigate,
  choose,
  data,
  shortcut,
  status,
  position,
}: {
  navigate: () => void;
  choose: (p: Place) => void;
  data: HomePlaces;
  shortcut: (kind: "home" | "work" | "saved") => void;
  status: LocationStatus;
  position: RiderLocation | null;
}) {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const rows = data.recent.slice(0, 3);
  return (
    <section className="nr-rider-home-panel" aria-label={t("destination")}>
      <div className="nr-home-handle" aria-hidden="true" />
      <div className="nr-rider-home-intro">
        <div>
          <span className="nr-home-kicker">NEXRIDE</span>
          <h2>{language === "am" ? "ወዴት መሄድ ይፈልጋሉ?" : "Where are you going?"}</h2>
        </div>
        <span className="nr-home-city"><Icon name="pin" size={14} />{t("city")}</span>
      </div>
      <h1 className="nr-sr-only">{t("where")}</h1>
      <button
        className="nr-home-search"
        onClick={navigate}
        aria-label={t("destination")}
      >
        <Icon name="search" size={22} />
        <span>{t("whereTo")}</span>
        <span className="nr-search-arrow">
          <Icon name="arrow" size={20} />
        </span>
      </button>
      <div className="nr-home-shortcuts">
        {(["home", "work", "saved"] as const).map((kind) => (
          <button
            key={kind}
            onClick={() => shortcut(kind)}
            aria-label={t(
              kind === "home"
                ? "home"
                : kind === "work"
                  ? "work"
                  : "savedPlaces",
            )}
          >
            <Icon
              name={
                kind === "home"
                  ? "home"
                  : kind === "work"
                    ? "briefcase"
                    : "star"
              }
              size={20}
            />
            <span>
              {t(
                kind === "home"
                  ? "home"
                  : kind === "work"
                    ? "work"
                    : "savedPlaces",
              )}
            </span>
            {kind !== "saved" && data.saved[kind] && (
              <i aria-hidden="true" title={t("shortcutSet")} />
            )}
          </button>
        ))}
      </div>
      <LocationMessage status={status} position={position} />
      <div className="nr-home-history-heading">
        <h2>{t("recentDestinations")}</h2>
      </div>
      {!data.recent.length && (
        <div className="nr-home-empty-state">
          <span><Icon name="clock" size={19} /></span>
          <div>
            <strong>{t("emptyRecent")}</strong>
            <small>Your real destinations will appear here after you start riding with NexRide.</small>
          </div>
        </div>
      )}
      <div className="nr-home-destinations">
        {rows.map((p) => (
          <ListRow
            key={placeKey(p)}
            icon="pin"
            title={
              language === "en" && p.name === "Bole Airport"
                ? p.address
                : placeName(p, language)
            }
            detail={
              p.name === "Bole Airport" ? t("city") : locality(p, language)
            }
            onClick={() => choose(p)}
          />
        ))}
      </div>
    </section>
  );
}

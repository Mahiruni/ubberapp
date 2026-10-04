"use client";
import { Icon, ListRow, useTranslation } from "./ui";
import { places, type Place } from "../../lib/nexride-places";
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
  const rows = data.recent.length
    ? data.recent.slice(0, 2)
    : [
        places.find((p) => p.name === "Bole Airport")!,
        places.find((p) => p.name === "Meskel Square")!,
      ];
  return (
    <section className="nr-rider-home-panel" aria-label={t("destination")}>
      <div className="nr-home-handle" aria-hidden="true" />
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
        <span>{t("preview")}</span>
      </div>
      {!data.recent.length && (
        <p className="nr-home-empty">{t("emptyRecent")}</p>
      )}
      {!data.recent.length && (
        <p className="nr-home-example-label">{t("previewDestinations")}</p>
      )}
      <div className="nr-home-destinations">
        {rows.map((p) => (
          <ListRow
            key={p.name}
            icon="pin"
            title={p.name === "Bole Airport" ? p.address : p.name}
            detail={p.name === "Bole Airport" ? t("city") : p.address}
            onClick={() => choose(p)}
          />
        ))}
      </div>
    </section>
  );
}

"use client";

import { useContext } from "react";
import { useSheetMotion } from "./use-sheet-motion";
import { Brand, Icon, LanguageContext, ListRow, useTranslation } from "./ui";
import { locality, placeKey, placeName } from "../../lib/nexride-search";
import { type Place } from "../../lib/nexride-places";
import type { HomePlaces } from "../../lib/nexride-home";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";

const HOME_RATIOS = [0.29, 0.5, 0.78] as const;

export function LocationMessage({
  status,
  position,
  label,
}: {
  status: LocationStatus;
  position: RiderLocation | null;
  label?: string;
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
        {status === "ready" && label
          ? label
          : t(
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
  locationLabel,
}: {
  navigate: () => void;
  choose: (p: Place) => void;
  data: HomePlaces;
  shortcut: (kind: "home" | "work" | "saved") => void;
  status: LocationStatus;
  position: RiderLocation | null;
  locationLabel?: string;
}) {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const rows = data.recent.slice(0, 3);
  const motion = useSheetMotion({ kind: "rider", ratios: HOME_RATIOS, defaultRatio: 0.5 });
  const snap = motion.currentRatio <= HOME_RATIOS[0] ? "collapsed" : motion.currentRatio >= HOME_RATIOS[2] ? "expanded" : "medium";

  return (
    <section
      className="nr-rider-home-panel nr-rider-home-sheet"
      aria-label={t("destination")}
      data-snap={snap}
      data-dragging={motion.dragging || undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="nr-home-sheet-grab-area">
        <button
          ref={motion.handleRef}
          type="button"
          className="nr-home-sheet-drag-zone"
          aria-label={
            language === "am"
              ? "የመነሻ ፓነሉን አስፋ ወይም አሳንስ"
              : "Expand or collapse ride panel"
          }
          aria-expanded={snap !== "collapsed"}
          {...motion.handleProps}
        >
          <span className="nr-home-handle" aria-hidden="true" />
        </button>

        <div className="nr-rider-home-intro">
          <div>
            <div className="nr-wrapper-brand"><Brand /><span>{language === "am" ? "የእርስዎ ጉዞ።" : "YOUR WAY FORWARD"}</span></div>
            <h2>
              {language === "am"
                ? "ወዴት መሄድ ይፈልጋሉ?"
                : "Where to next?"}
            </h2>
            <p className="nr-wrapper-subtitle">{language === "am" ? "መድረሻዎን ይምረጡ። ቀሪውን እኛ እንረዳዎታለን።" : "Your city. Your plans. Let’s get you there."}</p>
          </div>
        </div>
      </div>

      <div
        className="nr-home-sheet-scroll"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        <h1 className="nr-sr-only">{t("where")}</h1>
        <button
          className="nr-home-search"
          onClick={navigate}
          aria-label={t("destination")}
        >
          <Icon name="search" size={22} />
          <span>{language === "am" ? "ጉዞዎን ያቅዱ" : "Plan your ride"}</span>
          <span className="nr-search-arrow">
            <Icon name="arrow" size={20} />
          </span>
        </button>

        <div className="nr-home-expandable">
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

          <LocationMessage
            status={status}
            position={position}
            label={locationLabel}
          />

          <div className="nr-home-history-heading">
            <h2>{t("recentDestinations")}</h2>
          </div>

          {!data.recent.length && (
            <div className="nr-home-empty-state">
              <span>
                <Icon name="clock" size={19} />
              </span>
              <div>
                <strong>{t("emptyRecent")}</strong>
                <small>{language === "am" ? "የጎበኟቸው ቦታዎች እዚህ ይታያሉ።" : "Your next favourite place is a ride away."}</small>
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
        </div>
      </div>
    </section>
  );
}

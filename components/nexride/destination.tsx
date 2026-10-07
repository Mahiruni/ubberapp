"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { Button, Icon, LanguageContext, ListRow, useTranslation } from "./ui";
import { LocationMessage } from "./rider-home";
import {
  placeName,
  locality,
  placeKey,
  previewEndpoint,
  searchPreviewPlaces,
  type Endpoint,
} from "../../lib/nexride-search";
import type { Journey } from "../../lib/nexride-journey";
import type { HomePlaces } from "../../lib/nexride-home";
import type { Place } from "../../lib/nexride-places";
import type { RiderLocation, LocationStatus } from "../../lib/nexride-location";
export function endpointName(
  p: Endpoint,
  language: "en" | "am",
  t: ReturnType<typeof useTranslation>,
) {
  return p.source === "device"
    ? p.name ||
      (/^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(p.address || "")
        ? t("currentPickup")
        : p.address || t("currentPickup"))
    : p.source === "pin"
      ? `${t("mapPin")}${p.name ? ` · ${p.name}` : ""}`
      : placeName(p, language);
}
export function DestinationPanel({
  journey: j,
  back,
  proceed,
  choose,
  data,
  shortcut,
  status,
  position,
  locate,
}: {
  journey: Journey;
  back: () => void;
  proceed: () => void;
  choose: (p: Place) => void;
  data: HomePlaces;
  shortcut: "home" | "work" | null;
  status: LocationStatus;
  position: RiderLocation | null;
  locate: () => void;
}) {
  const t = useTranslation(),
    language = useContext(LanguageContext);
  const [field, setField] = useState<"pickup" | "destination">("destination");
  const [query, setQuery] = useState({ pickup: "", destination: "" });
  const [remote, setRemote] = useState<{ status: string; results: Endpoint[] }>(
    { status: "idle", results: [] },
  );
  const local = searchPreviewPlaces(query[field]);
  const firstResult = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ start: number; ratio: number } | null>(null);
  const draftRestored = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nexride.rider.destination.draft");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.field === "pickup" || saved?.field === "destination") setField(saved.field);
        if (saved?.query && typeof saved.query.pickup === "string" && typeof saved.query.destination === "string") {
          setQuery({
            pickup: saved.query.pickup.slice(0, 120),
            destination: saved.query.destination.slice(0, 120),
          });
        }
      }
    } catch {}
    draftRestored.current = true;
  }, []);
  useEffect(() => {
    if (!draftRestored.current) return;
    try {
      sessionStorage.setItem("nexride.rider.destination.draft", JSON.stringify({ field, query }));
    } catch {}
  }, [field, query, language]);
  useEffect(() => {
    const q = query[field].trim();
    setRemote({ status: q.length >= 3 ? "loading" : "idle", results: [] });
    if (q.length < 3) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setRemote({ status: "loading", results: [] });
      fetch(
        `/api/rider/search?q=${encodeURIComponent(q)}&lang=${language}`,
        {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
          cache: "no-store",
        },
      )
        .then((r) => r.json())
        .then((data) => {
          if (active)
            setRemote({
              status: data.status,
              results: Array.isArray(data.results) ? data.results : [],
            });
        })
        .catch(() => {
          if (active) setRemote({ status: "error", results: [] });
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [field, query, language]);
  const select = (point: Endpoint) => {
    if (shortcut) {
      if (point.source === "preview") choose(point);
      return;
    }
    if (field === "destination" && point.source === "preview") choose(point);
    else j.select(field, point);
    setQuery((q) => ({ ...q, [field]: "" }));
    setRemote({ status: "idle", results: [] });
    if (field === "pickup") setField("destination");
    document.activeElement instanceof HTMLElement &&
      document.activeElement.blur();
  };
  const picking = j.pinMode;
  const pin =
    picking === "pickup"
      ? j.pickup
      : picking === "destination"
        ? j.destination
        : null;
  const unconfirmed =
    j.pickup && !j.pickup.confirmed
      ? "pickup"
      : j.destination && !j.destination.confirmed
        ? "destination"
        : null;
  const showSuggestions =
    !!shortcut || !!query[field] || !j.destination || !j.pickup;
  return (
    <section
      className="nr-destination-panel"
      aria-label={t("destinationSearch")}
    >
      <button
        className="nr-sheet-drag"
        aria-label={t("resizeSheet")}
        aria-valuemin={28}
        aria-valuemax={75}
        aria-valuenow={Math.round(j.sheetRatio * 100)}
        role="slider"
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            j.setSheetRatio(
              e.key === "Home"
                ? 0.28
                : e.key === "End"
                  ? 0.75
                  : Math.min(
                      0.75,
                      Math.max(
                        0.28,
                        j.sheetRatio + (e.key === "ArrowUp" ? 0.1 : -0.1),
                      ),
                    ),
            );
          }
        }}
        onPointerDown={(e) => {
          drag.current = { start: e.clientY, ratio: j.sheetRatio };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            j.setSheetRatio(
              Math.min(
                0.75,
                Math.max(
                  0.28,
                  drag.current.ratio +
                    (drag.current.start - e.clientY) /
                      (j.viewport.height || 800),
                ),
              ),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span />
      </button>
      <header>
        <button
          className="nr-icon-button"
          aria-label={t("back")}
          onClick={back}
        >
          <Icon name="back" />
        </button>
        <div className="nr-destination-title">
          <span>
            {language === "am"
              ? picking
                ? "ቦታውን በካርታ ያስተካክሉ"
                : "ጉዞዎን ያቅዱ"
              : picking
                ? "Fine-tune on the map"
                : "Plan your ride"}
          </span>
          <h1>
            {t(
              shortcut === "home"
                ? "saveHome"
                : shortcut === "work"
                  ? "saveWork"
                  : picking
                    ? "adjustMapLocation"
                    : "destinationSearch",
            )}
          </h1>
        </div>
      </header>
      <div className="nr-destination-body">
        {!picking && (
          <>
            <div className="nr-endpoint-fields">
              {(["pickup", "destination"] as const).map((target) => {
                const point = target === "pickup" ? j.pickup : j.destination;
                return (
                  <label
                    key={target}
                    className={`nr-endpoint-field ${field === target ? "focused" : ""}`}
                  >
                    <Icon
                      name={target === "pickup" ? "locate" : "pin"}
                      size={18}
                    />
                    <span>
                      <small>
                        {t(target === "pickup" ? "pickup" : "dropoff")}
                      </small>
                      <input
                        aria-label={t(
                          target === "pickup" ? "editPickup" : "destination",
                        )}
                        autoFocus={target === "destination" && !j.destination}
                        placeholder={t(
                          target === "pickup" ? "selectPickup" : "whereTo",
                        )}
                        value={
                          query[target] ||
                          (point ? endpointName(point, language, t) : "")
                        }
                        onFocus={() => setField(target)}
                        onChange={(e) => {
                          j.clear(target);
                          setField(target);
                          setQuery((q) => ({ ...q, [target]: e.target.value }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            firstResult.current?.focus();
                          }
                        }}
                        maxLength={120}
                      />
                    </span>
                    {point && (
                      <button
                        aria-label={t(
                          target === "pickup"
                            ? "clearPickup"
                            : "clearDestination",
                        )}
                        onClick={() => {
                          j.clear(target);
                          setQuery((q) => ({ ...q, [target]: "" }));
                        }}
                      >
                        <Icon name="close" size={17} />
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="nr-destination-actions">
              <button
                onClick={() => {
                  j.requestCurrent();
                  locate();
                }}
                disabled={status === "loading"}
              >
                <Icon name="locate" size={18} />
                {t("current")}
              </button>
              <button
                onClick={() => {
                  setQuery((q) => ({ ...q, [field]: "" }));
                  j.startPin(field);
                }}
              >
                <Icon name="pin" size={18} />
                {t("chooseOnMap")}
              </button>
            </div>
            {(status === "denied" ||
              status === "unavailable" ||
              status === "loading") && (
              <LocationMessage status={status} position={position} />
            )}
          </>
        )}
        {picking && (
          <div className="nr-pin-instructions">
            <Icon name="pin" size={24} />
            <h2>
              {t(picking === "pickup" ? "adjustPickup" : "adjustDestination")}
            </h2>
            <p>{t("pinInstructions")}</p>
            {pin && (
              <>
                <strong>{endpointName(pin, language, t)}</strong>
                <p className="nr-pin-coordinate">{pin.address}</p>
              </>
            )}
            <p>{t("mapKeyboardInstructions")}</p>
          </div>
        )}
        {!picking && unconfirmed && (
          <div className="nr-search-state warning" role="status">
            <Icon name="info" size={18} />
            <p>{t("uncertainPickup")}</p>
            <Button onClick={() => j.confirm(unconfirmed)}>
              {t(
                unconfirmed === "pickup"
                  ? "confirmPickup"
                  : "confirmDestination",
              )}
            </Button>
          </div>
        )}
        {!picking && showSuggestions && (
          <>
            {!query[field] && (
              <>
                <h2>{t("savedPlaces")}</h2>
                <div className="nr-search-saved">
                  {(["home", "work"] as const).map((kind) => (
                    <button
                      key={kind}
                      disabled={!data.saved[kind]}
                      onClick={() => select(previewEndpoint(data.saved[kind]!))}
                    >
                      <Icon
                        name={kind === "home" ? "home" : "briefcase"}
                        size={18}
                      />
                      {t(kind)}
                      <small>
                        {data.saved[kind]
                          ? placeName(data.saved[kind]!, language)
                          : t("notSet")}
                      </small>
                    </button>
                  ))}
                </div>
                <h2>{t("recentSearches")}</h2>
                {!data.recent.length && (
                  <p className="nr-muted">{t("noRecentSearches")}</p>
                )}
                {data.recent.slice(0, 3).map((p) => (
                  <ListRow
                    key={placeKey(p)}
                    icon="clock"
                    title={placeName(p, language)}
                    detail={`${locality(p, language)} · ${t("sample")}`}
                    onClick={() => select(previewEndpoint(p))}
                  />
                ))}
              </>
            )}
            {remote.status === "loading" && (
              <p role="status" className="nr-muted">
                {t("searchingPlaces")}
              </p>
            )}
            {remote.results.length > 0 && !shortcut && (
              <>
                <h2>{t("providerResults")}</h2>
                {remote.results.map((p, i) => (
                  <button
                    className="nr-place-suggestion"
                    key={placeKey(p)}
                    ref={i === 0 ? firstResult : undefined}
                    onClick={() => select(p)}
                  >
                    <Icon name="pin" />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.address}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </>
            )}
            <h2>{t("previewDestinations")}</h2>
            <p className="nr-preview-search-label">{t("previewSearchNote")}</p>
            {local.map((p, i) => (
              <button
                className="nr-place-suggestion"
                key={placeKey(p)}
                ref={
                  i === 0 && !remote.results.length ? firstResult : undefined
                }
                onClick={() => select(previewEndpoint(p))}
              >
                <Icon name="pin" />
                <span>
                  <strong>{placeName(p, language)}</strong>
                  <small>{locality(p, language)}</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
            ))}
            {!local.length &&
              !remote.results.length &&
              remote.status !== "loading" && (
                <p className="nr-empty-text" role="status">
                  {t("noResults")}
                </p>
              )}
            {["error", "unavailable"].includes(remote.status) && (
              <p className="nr-muted" role="status">
                {t("geocodingUnavailable")}
              </p>
            )}
          </>
        )}
        {!picking && j.valid && <RouteReview journey={j} />}
      </div>
      {!shortcut && (
        <footer>
          {picking ? (
            <Button disabled={!pin} onClick={() => j.confirm(picking)}>
              {t(picking === "pickup" ? "confirmPickup" : "confirmDestination")}
            </Button>
          ) : (
            <Button onClick={proceed} disabled={!j.canContinue}>
              {t(
                j.routeState.status === "unavailable"
                  ? "previewRideOptions"
                  : "continueRideOptions",
              )}
            </Button>
          )}
          <small>{t("previewBookingBoundary")}</small>
        </footer>
      )}
    </section>
  );
}
export function RouteReview({ journey: j }: { journey: Journey }) {
  const t = useTranslation();
  const state = j.routeState;
  return (
    <div className={`nr-route-review ${state.status}`} role="status">
      <h2>{t("journeyReview")}</h2>
      {state.status === "ready" && state.route ? (
        <>
          <strong>
            {Math.max(1, Math.round(state.route.durationSeconds / 60))}{" "}
            {t("minutes")} · {(state.route.distanceMeters / 1000).toFixed(1)}{" "}
            {t("kilometers")}
          </strong>
          <div
            className="nr-route-traffic"
            data-traffic={state.route.traffic?.level || "unavailable"}
          >
            <i aria-hidden="true" />
            <span>
              {state.route.traffic
                ? t(
                    state.route.traffic.level === "low"
                      ? "trafficLow"
                      : state.route.traffic.level === "moderate"
                        ? "trafficModerate"
                        : state.route.traffic.level === "heavy"
                          ? "trafficHeavy"
                          : "trafficSevere",
                  )
                : t("trafficUnavailable")}
            </span>
          </div>
          <p>
            {t(state.route.traffic ? "trafficAwareEta" : "providerEstimate")}
          </p>
        </>
      ) : (
        <p>
          {t(
            state.status === "loading"
              ? "routingLoading"
              : state.status === "coverage"
                ? state.coverage?.kind === "configured"
                  ? "outsideCoverage"
                  : "outsidePreviewArea"
                : state.status === "same"
                  ? "sameLocations"
                  : state.status === "unavailable"
                    ? "routingUnavailable"
                    : "routingFailed",
          )}
        </p>
      )}
      {state.coverage?.kind === "preview" && (
        <small>{t("previewCoverage")}</small>
      )}
      {state.status === "error" && (
        <Button variant="secondary" onClick={j.retryRoute}>
          {t("tryAgain")}
        </Button>
      )}
    </div>
  );
}

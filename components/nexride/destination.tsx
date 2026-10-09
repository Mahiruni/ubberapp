"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { Button, Icon, LanguageContext, useTranslation } from "./ui";
import { LocationMessage } from "./rider-home";
import { RiderSheetHandle } from "./rider-sheet";
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
const RECENT_SEARCHES_KEY = "nexride.rider.search.recent.v2";

function restoreRecentSearches(): Endpoint[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const results: Endpoint[] = [];
    for (const value of raw) {
      const lat = Number(value?.lat);
      const lng = Number(value?.lng);
      const source = value?.source === "provider" ? "provider" : value?.source === "preview" ? "preview" : null;
      if (
        !source ||
        !Number.isFinite(lat) ||
        Math.abs(lat) > 90 ||
        !Number.isFinite(lng) ||
        Math.abs(lng) > 180
      ) continue;
      const name = typeof value?.name === "string" ? value.name.slice(0, 180) : "";
      const address = typeof value?.address === "string" ? value.address.slice(0, 320) : "";
      if (!name && !address) continue;
      results.push({
        lat,
        lng,
        name,
        address,
        source,
        confirmed: true,
        ...(typeof value?.nameAm === "string" ? { nameAm: value.nameAm.slice(0, 180) } : {}),
        ...(typeof value?.neighborhood === "string" ? { neighborhood: value.neighborhood.slice(0, 180) } : {}),
        ...(typeof value?.subcity === "string" ? { subcity: value.subcity.slice(0, 180) } : {}),
      });
      if (results.length === 6) break;
    }
    return results;
  } catch {
    return [];
  }
}

function storeRecentSearches(items: Endpoint[]) {
  try {
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(
        items.slice(0, 6).map((item) => ({
          lat: item.lat,
          lng: item.lng,
          name: item.name,
          address: item.address,
          source: item.source,
          confirmed: true,
          nameAm: item.nameAm,
          neighborhood: item.neighborhood,
          subcity: item.subcity,
        })),
      ),
    );
  } catch {}
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
  // Begin at the Rider's starting point, not the drop-off field.
  const [field, setField] = useState<"pickup" | "destination">("pickup");
  const [query, setQuery] = useState({ pickup: "", destination: "" });
  const [searchActive, setSearchActive] = useState(false);
  const [recentSearches, setRecentSearches] = useState<Endpoint[]>([]);
  const [remote, setRemote] = useState<{ status: string; results: Endpoint[] }>(
    { status: "idle", results: [] },
  );
  const local = searchPreviewPlaces(query[field]);
  const firstResult = useRef<HTMLButtonElement>(null);
  const searchCache = useRef(
    new Map<string, { at: number; results: Endpoint[] }>(),
  );
  const draftRestored = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Close the expanded search surface on route/screen changes. This does not
  // affect the user's saved places or in-progress search draft.
  useEffect(() => () => j.setSearchOpen(false), [j.setSearchOpen]);

  useEffect(() => {
    setRecentSearches(restoreRecentSearches());
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("nexride.rider.destination.draft");
      if (raw) {
        const saved = JSON.parse(raw);
        // Restore typed values, but never give a saved destination the initial
        // keyboard focus when the Rider reopens Plan your ride.
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
    setRemote({ status: q.length >= 2 ? "loading" : "idle", results: [] });
    if (q.length < 2) return;

    const proximity =
      position &&
      Number.isFinite(position.lat) &&
      Number.isFinite(position.lng)
        ? `${position.lat.toFixed(3)},${position.lng.toFixed(3)}`
        : "addis";
    const cacheKey = `${language}|${q.toLocaleLowerCase()}|${proximity}`;
    const cached = searchCache.current.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60_000) {
      setRemote({ status: "ready", results: cached.results });
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, lang: language });
      if (
        position &&
        Number.isFinite(position.lat) &&
        Number.isFinite(position.lng)
      ) {
        params.set("lat", String(position.lat));
        params.set("lng", String(position.lng));
      }

      setRemote({ status: "loading", results: [] });
      fetch(`/api/rider/search?${params}`, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((data) => {
          if (!active) return;
          const results = Array.isArray(data.results) ? data.results : [];
          if (data.status === "ready")
            searchCache.current.set(cacheKey, { at: Date.now(), results });
          setRemote({ status: data.status, results });
        })
        .catch(() => {
          if (active) setRemote({ status: "error", results: [] });
        });
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [field, query, language, position?.lat, position?.lng]);

  const rememberSearch = (point: Endpoint) => {
    if (!["provider", "preview"].includes(point.source)) return;
    setRecentSearches((current) => {
      const next = [
        point,
        ...current.filter((item) => placeKey(item) !== placeKey(point)),
      ].slice(0, 6);
      storeRecentSearches(next);
      return next;
    });
  };

  const select = (point: Endpoint) => {
    if (shortcut) {
      if (point.source === "preview") choose(point);
      return;
    }
    rememberSearch(point);
    if (field === "destination" && point.source === "preview") choose(point);
    else j.select(field, point);
    setQuery((q) => ({ ...q, [field]: "" }));
    setRemote({ status: "idle", results: [] });
    setSearchActive(false);
    j.setSearchOpen(false);
    j.setSheetRatio(0.46);
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
  const typedQuery = query[field].trim();
  const previewRecent = data.recent.map(previewEndpoint);
  const recentChoices = [...recentSearches, ...previewRecent]
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => placeKey(candidate) === placeKey(item)) === index,
    )
    .slice(0, 5);
  const liveSuggestions = [
    ...(!shortcut ? remote.results : []),
    ...local.map(previewEndpoint),
  ]
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => placeKey(candidate) === placeKey(item)) === index,
    )
    .filter((item) => !shortcut || item.source === "preview")
    .slice(0, 16);
  const keyboardOpen = j.viewport.keyboard;
  const showSuggestions =
    keyboardOpen ||
    searchActive ||
    !!shortcut ||
    !!typedQuery ||
    !j.destination ||
    !j.pickup;
  return (
    <section
      className="nr-destination-panel"
      aria-label={t("destinationSearch")}
      data-search-active={searchActive || undefined}
    >
      <RiderSheetHandle
        label={t("resizeSheet")}
        defaultRatio={0.46}
        snaps={[0.28, 0.46, 0.75]}
        ratio={j.sheetRatio}
        onRatioChange={j.setSheetRatio}
        scrollSelector=".nr-destination-body"
        storageKey="nexride.rider.sheet.destination"
      />
      <header>
        <button
          className="nr-icon-button"
          aria-label={t("back")}
          onClick={() => { j.setSearchOpen(false); back(); }}
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
      <div ref={bodyRef} className="nr-destination-body">
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
                        autoFocus={target === "pickup"}
                        placeholder={
                          target === "pickup"
                            ? (language === "am" ? "ጉዞዎን ያቅዱ" : "Plan your ride")
                            : t("whereTo")
                        }
                        value={
                          query[target] ||
                          (point ? endpointName(point, language, t) : "")
                        }
                        onFocus={() => {
                          setField(target);
                          setSearchActive(true);
                          j.setSearchOpen(true);
                          bodyRef.current?.scrollTo({ top: 0 });
                          if (j.sheetRatio < 0.75) j.setSheetRatio(0.75);
                        }}
                        onChange={(e) => {
                          j.clear(target);
                          setField(target);
                          setSearchActive(true);
                          j.setSearchOpen(true);
                          setQuery((q) => ({ ...q, [target]: e.target.value }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            firstResult.current?.focus();
                          }
                          if (e.key === "Escape") {
                            j.setSearchOpen(false);
                            setSearchActive(false);
                            e.currentTarget.blur();
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
                  j.setSearchOpen(false);
                  setSearchActive(false);
                  document.activeElement instanceof HTMLElement && document.activeElement.blur();
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
          <section className="nr-search-discovery" aria-live="polite">
            {!typedQuery ? (
              <>
                {(data.saved.home || data.saved.work) && (
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
                  </>
                )}

                <h2>{t("recentSearches")}</h2>
                {recentChoices.length ? (
                  <div className="nr-recent-place-list">
                    {recentChoices.map((point, index) => (
                      <button
                        type="button"
                        className="nr-place-suggestion"
                        key={placeKey(point)}
                        ref={index === 0 ? firstResult : undefined}
                        onClick={() => select(point)}
                      >
                        <Icon name="clock" />
                        <span>
                          <strong>{endpointName(point, language, t)}</strong>
                          <small>{point.address || locality(point, language)}</small>
                        </span>
                        <Icon name="chevron" size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="nr-muted">{t("noRecentSearches")}</p>
                )}

                <h2>{language === "am" ? "ታዋቂ ቦታዎች" : "Popular places"}</h2>
                {local.slice(0, 4).map((p) => (
                  <button
                    type="button"
                    className="nr-place-suggestion"
                    key={placeKey(p)}
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
              </>
            ) : (
              <>
                <div className="nr-search-results-heading">
                  <h2>{language === "am" ? "የተጠቆሙ ቦታዎች" : "Suggested places"}</h2>
                  {remote.status === "loading" && (
                    <span role="status">{t("searchingPlaces")}</span>
                  )}
                </div>

                {liveSuggestions.map((point, index) => (
                  <button
                    type="button"
                    className="nr-place-suggestion"
                    key={placeKey(point)}
                    ref={index === 0 ? firstResult : undefined}
                    onClick={() => select(point)}
                  >
                    <Icon name="pin" />
                    <span>
                      <strong>{endpointName(point, language, t)}</strong>
                      <small>{point.address || locality(point, language)}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}

                {!liveSuggestions.length && remote.status !== "loading" && (
                  <p className="nr-empty-text" role="status">
                    {t("noResults")}
                  </p>
                )}
                {["error", "unavailable"].includes(remote.status) &&
                  !liveSuggestions.length && (
                    <p className="nr-muted" role="status">
                      {t("geocodingUnavailable")}
                    </p>
                  )}
              </>
            )}
          </section>
        )}
        {!picking && j.valid && <RouteReview journey={j} />}
      </div>
      {!keyboardOpen && !shortcut && (!searchActive || j.canContinue || picking) && (
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

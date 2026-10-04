"use client";
import { useContext, useEffect, useState } from "react";
import { places, type Place } from "../../lib/nexride-places";
import {
  previewFare,
  rideOptions,
  type PreviewTrip,
} from "../../lib/nexride-preview";
import {
  Button,
  Icon,
  ListRow,
  Sheet,
  useTranslation,
  LanguageContext,
} from "./ui";
import { RiderHomePanel } from "./rider-home";
import {
  emptyHomePlaces,
  HOME_PLACES_KEY,
  restoreHomePlaces,
  serializeHomePlaces,
  type HomePlaces,
} from "../../lib/nexride-home";
import { DestinationPanel, endpointName } from "./destination";
import { placeKey } from "../../lib/nexride-search";
import type { Journey } from "../../lib/nexride-journey";
import type { RiderLocation, LocationStatus } from "../../lib/nexride-location";
export type RiderScreen =
  | "home"
  | "saved"
  | "destination"
  | "rides"
  | "finding"
  | "trip"
  | "live"
  | "summary"
  | "wallet"
  | "trips"
  | "profile";
export function RiderWorkspace({
  screen,
  navigate,
  onSafety,
  onUnavailable,
  trip,
  setTrip,
  position,
  locationStatus,
  locate,
  journey,
}: {
  screen: RiderScreen;
  navigate: (s: RiderScreen) => void;
  onSafety: () => void;
  onUnavailable: (title: string) => void;
  trip: PreviewTrip | null;
  setTrip: (trip: PreviewTrip) => void;
  position: RiderLocation | null;
  locationStatus: LocationStatus;
  locate: () => void;
  journey: Journey;
}) {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const { pickup, destination } = journey;
  const [rideId, setRideId] = useState("economy");
  const [homePlaces, setHomePlaces] = useState<HomePlaces>(emptyHomePlaces);
  const [savingShortcut, setSavingShortcut] = useState<"home" | "work" | null>(
    null,
  );
  useEffect(() => {
    try {
      setHomePlaces(restoreHomePlaces(localStorage.getItem(HOME_PLACES_KEY)));
    } catch {}
  }, []);
  const savePlaces = (next: HomePlaces) => {
    setHomePlaces(next);
    try {
      localStorage.setItem(HOME_PLACES_KEY, serializeHomePlaces(next));
    } catch {}
  };
  const [rating, setRating] = useState(0);
  const [ratingSaved, setRatingSaved] = useState(false);
  const selectedRide =
    rideOptions.find((r) => r.id === rideId) || rideOptions[0];
  const quote =
    pickup && destination
      ? previewFare(pickup, destination, selectedRide)
      : null;
  useEffect(() => {
    if (screen !== "finding") return;
    const timer = window.setTimeout(() => navigate("trip"), 1600);
    return () => window.clearTimeout(timer);
  }, [screen, navigate]);
  const choose = (p: Place) => {
    if (savingShortcut) {
      savePlaces({
        ...homePlaces,
        saved: { ...homePlaces.saved, [savingShortcut]: p },
      });
      setSavingShortcut(null);
      navigate("home");
      return;
    }
    savePlaces({
      ...homePlaces,
      recent: [
        p,
        ...homePlaces.recent.filter((a) => placeKey(a) !== placeKey(p)),
      ].slice(0, 5),
    });
    journey.choosePreview(p);
    navigate("destination");
  };
  const bookPreview = () => {
    if (!destination || !pickup || !quote || !journey.canContinue) return;
    setRating(0);
    setRatingSaved(false);
    setTrip({
      // Temporary geocoder labels must not enter persistent preview trip history.
      pickup:
        pickup.source === "preview"
          ? endpointName(pickup, language, t)
          : t("pickup"),
      destination:
        destination.source === "preview"
          ? endpointName(destination, language, t)
          : t("dropoff"),
      ride: selectedRide.id,
      amount: quote.amount,
      completed: false,
      rating: 0,
    });
    navigate("finding");
  };
  const finish = () => {
    if (trip) setTrip({ ...trip, completed: true });
    navigate("summary");
  };
  if (screen === "home")
    return (
      <RiderHomePanel
        navigate={() => {
          setSavingShortcut(null);
          navigate("destination");
        }}
        choose={choose}
        data={homePlaces}
        status={locationStatus}
        position={position}
        shortcut={(kind) => {
          if (kind === "saved") {
            navigate("saved");
            return;
          }
          const saved = homePlaces.saved[kind];
          if (saved) {
            choose(saved);
            return;
          }
          setSavingShortcut(kind);
          navigate("destination");
        }}
      />
    );
  if (screen === "saved")
    return (
      <Sheet title={t("savedPlaces")} onBack={() => navigate("home")}>
        <p className="nr-muted">{t("savedPreviewNote")}</p>
        {(["home", "work"] as const).map((kind) => (
          <ListRow
            key={kind}
            icon={kind === "home" ? "home" : "briefcase"}
            title={t(kind)}
            detail={homePlaces.saved[kind]?.name || t("addShortcut")}
            onClick={() => {
              setSavingShortcut(kind);
              navigate("destination");
            }}
          />
        ))}
        {!homePlaces.saved.home && !homePlaces.saved.work && (
          <p className="nr-empty-text">{t("noSavedPlaces")}</p>
        )}
      </Sheet>
    );
  if (screen === "destination")
    return (
      <DestinationPanel
        journey={journey}
        back={() => {
          setSavingShortcut(null);
          navigate("home");
        }}
        proceed={() => {
          if (journey.canContinue) navigate("rides");
        }}
        choose={choose}
        data={homePlaces}
        shortcut={savingShortcut}
        status={locationStatus}
        position={position}
        locate={locate}
      />
    );
  if (screen === "rides")
    return (
      <Sheet title={t("chooseRide")} onBack={() => navigate("destination")}>
        <div className="nr-route-summary">
          <div>
            <span className="nr-route-dot" />
            <span>
              <small>{t("pickup")}</small>
              <strong>
                {pickup ? endpointName(pickup, language, t) : t("selectPickup")}
              </strong>
            </span>
          </div>
          <div>
            <span className="nr-route-dot end" />
            <span>
              <small>{t("dropoff")}</small>
              <strong>
                {destination
                  ? endpointName(destination, language, t)
                  : t("destination")}
              </strong>
            </span>
            <button
              className="nr-text-button"
              onClick={() => navigate("destination")}
            >
              {t("edit")}
            </button>
          </div>
        </div>
        <div
          className="nr-ride-options"
          role="radiogroup"
          aria-label={t("chooseRide")}
        >
          {rideOptions.map((r) => (
            <button
              role="radio"
              aria-checked={rideId === r.id}
              key={r.id}
              className={`nr-ride-card ${rideId === r.id ? "selected" : ""}`}
              onClick={() => setRideId(r.id)}
            >
              <span className="nr-vehicle">
                <Icon name="car" size={32} />
              </span>
              <span className="nr-ride-copy">
                <strong>{t(r.id)}</strong>
                <small>
                  {r.seats} {t("seats")} · {t(r.description)}
                </small>
              </span>
              <span className="nr-ride-price">
                <strong>
                  {destination
                    ? pickup
                      ? previewFare(pickup, destination, r).amount
                      : "—"
                    : "—"}
                </strong>
                <small>ETB · {t("sample")}</small>
              </span>
              {rideId === r.id && (
                <span className="nr-selection">
                  <Icon name="check" size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="nr-payment-line">
          <Icon name="wallet" size={17} />
          <span>{t("cash")}</span>
          <small>{t("sampleFare")}</small>
        </div>
        <Button onClick={bookPreview} disabled={!journey.canContinue}>
          {t("previewRide")}
          {quote && <span> · {quote.amount} ETB</span>}
        </Button>
        <p className="nr-fine-print">{t("fareNote")}</p>
      </Sheet>
    );
  if (screen === "finding")
    return (
      <Sheet>
        <div className="nr-matching">
          <div className="nr-match-ring">
            <Icon name="car" size={30} />
          </div>
          <h1>{t("finding")}</h1>
          <p>{t("findingNote")}</p>
          <Button variant="secondary" onClick={() => navigate("rides")}>
            {t("cancel")}
          </Button>
        </div>
      </Sheet>
    );
  if (screen === "trip" || screen === "live")
    return (
      <Sheet
        title={t(screen === "live" ? "onTrip" : "assigned")}
        subtitle={t(screen === "live" ? "tripNote" : "sampleDriver")}
      >
        <DriverCard />
        <div className="nr-contact-actions">
          {(
            [
              { icon: "phone", key: "call" },
              { icon: "chat", key: "chat" },
              { icon: "share", key: "share" },
              { icon: "shield", key: "safety" },
            ] as const
          ).map((a) => (
            <button
              key={a.key}
              onClick={() =>
                a.key === "safety" ? onSafety() : onUnavailable(t(a.key))
              }
            >
              <span>
                <Icon name={a.icon} />
              </span>
              {t(a.key)}
            </button>
          ))}
        </div>
        <div className="nr-trip-destination">
          <Icon name="pin" />
          <span>
            <small>{t("dropoff")}</small>
            <strong>{trip?.destination}</strong>
          </span>
        </div>
        <Button onClick={screen === "live" ? finish : () => navigate("live")}>
          {t(screen === "live" ? "complete" : "startPreview")}
        </Button>
        <Button variant="ghost" onClick={() => navigate("home")}>
          {t("cancel")}
        </Button>
      </Sheet>
    );
  if (screen === "summary")
    return (
      <Sheet>
        <div className="nr-completion">
          <span className="nr-completion-check">
            <Icon name="check" size={30} />
          </span>
          <h1>{t("completed")}</h1>
          <p>{t("thanks")}</p>
        </div>
        <DriverCard compact />
        <div className="nr-receipt">
          <span>{t("sampleFare")}</span>
          <strong>{trip?.amount || 0} ETB</strong>
        </div>
        <h2 className="nr-center">{t("howRide")}</h2>
        <div className="nr-stars" role="group" aria-label={t("howRide")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-label={`${n} / 5`}
              aria-pressed={rating === n}
              className={n <= rating ? "filled" : ""}
              onClick={() => {
                setRating(n);
                setRatingSaved(false);
              }}
            >
              <Icon name="star" size={28} />
            </button>
          ))}
        </div>
        {ratingSaved && (
          <p className="nr-center nr-muted" role="status">
            {t("ratingSaved")}
          </p>
        )}
        <Button
          disabled={!rating || ratingSaved}
          onClick={() => {
            if (trip) setTrip({ ...trip, rating });
            setRatingSaved(true);
          }}
        >
          {t("submit")}
        </Button>
        <Button variant="ghost" onClick={() => navigate("home")}>
          {t("skip")}
        </Button>
        <p className="nr-fine-print">{t("walletNote")}</p>
      </Sheet>
    );
  if (screen === "wallet")
    return (
      <Sheet title={t("wallet")}>
        <div className="nr-balance-card">
          <small>{t("balance")}</small>
          <strong>
            1,240 <span>ETB</span>
          </strong>
          <p>{t("walletNote")}</p>
          <Button onClick={() => onUnavailable(t("addPayment"))}>
            {t("addPayment")}
          </Button>
        </div>
        <h2>{t("paymentMethods")}</h2>
        <div className="nr-list">
          <ListRow icon="wallet" title={t("cash")} detail={t("default")} />
          <ListRow
            icon="money"
            title={t("mobileMoney")}
            detail={t("unavailable")}
            onClick={() => onUnavailable(t("mobileMoney"))}
          />
        </div>
      </Sheet>
    );
  return (
    <Sheet title={t("trips")}>
      {trip ? (
        <>
          <p className="nr-muted">{t("recent")}</p>
          <div className="nr-list">
            <ListRow
              icon={trip.completed ? "check" : "car"}
              title={trip.destination}
              detail={`${t(trip.ride)} · ${trip.amount} ETB · ${t("sample")}`}
              onClick={() => navigate(trip.completed ? "summary" : "trip")}
            />
          </div>
          <p className="nr-fine-print">{t("previewInfo")}</p>
        </>
      ) : (
        <div className="nr-empty-state">
          <span>
            <Icon name="clock" size={30} />
          </span>
          <h2>{t("emptyTrips")}</h2>
          <p>{t("emptyNote")}</p>
          <Button onClick={() => navigate("destination")}>
            {t("chooseRide")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
export function DriverCard({ compact = false }: { compact?: boolean }) {
  const t = useTranslation();
  return (
    <div className={`nr-driver-card ${compact ? "compact" : ""}`}>
      <div className="nr-avatar">TA</div>
      <div>
        <strong>Tesfaye Alemu</strong>
        <small>
          <span className="nr-rating-star">★</span> 4.9 · {t("sample")}
        </small>
        <small>Toyota Corolla · ET 74235</small>
      </div>
      <span className="nr-sample-pill">{t("sample")}</span>
    </div>
  );
}

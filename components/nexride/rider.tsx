"use client";
import { useEffect, useMemo, useState } from "react";
import { places, type Place } from "../../lib/nexride-places";
import {
  previewFare,
  rideOptions,
  type PreviewTrip,
} from "../../lib/nexride-preview";
import { Button, Icon, ListRow, Sheet, useTranslation } from "./ui";
export type RiderScreen =
  | "home"
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
}: {
  screen: RiderScreen;
  navigate: (s: RiderScreen) => void;
  onSafety: () => void;
  onUnavailable: (title: string) => void;
  trip: PreviewTrip | null;
  setTrip: (trip: PreviewTrip) => void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const [pickup, setPickup] = useState(places[0]);
  const [destination, setDestination] = useState<Place | null>(null);
  const [rideId, setRideId] = useState("economy");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "loading" | "ready" | "denied"
  >("idle");
  const [rating, setRating] = useState(0);
  const [ratingSaved, setRatingSaved] = useState(false);
  const selectedRide =
    rideOptions.find((r) => r.id === rideId) || rideOptions[0];
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const unique = places.filter(
      (p, i) => places.findIndex((a) => a.name === p.name) === i,
    );
    return (
      q
        ? unique.filter((p) =>
            `${p.name} ${p.address}`.toLowerCase().includes(q),
          )
        : [
            "Bole Airport",
            "Meskel Square",
            "Kazanchis",
            "Edna Mall",
            "Entoto Park",
          ]
            .map((name) => unique.find((p) => p.name === name)!)
            .filter(Boolean)
    ).slice(0, 10);
  }, [query]);
  const quote = destination
    ? previewFare(gps || pickup, destination, selectedRide)
    : null;
  useEffect(() => {
    if (screen !== "finding") return;
    const timer = window.setTimeout(() => navigate("trip"), 1600);
    return () => window.clearTimeout(timer);
  }, [screen, navigate]);
  const locate = () => {
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocationStatus("ready");
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };
  const choose = (p: Place) => {
    setDestination(p);
    setQuery("");
    navigate("rides");
  };
  const bookPreview = () => {
    if (!destination || !quote) return;
    setRating(0);
    setRatingSaved(false);
    setTrip({
      pickup: gps ? t("locationReady") : pickup.name,
      destination: destination.name,
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
  const locationControl = (
    <>
      <button
        className="nr-location-button"
        onClick={locate}
        disabled={locationStatus === "loading"}
      >
        <Icon name="locate" />
        <span>
          {t(
            locationStatus === "loading"
              ? "locating"
              : locationStatus === "ready"
                ? "locationReady"
                : "current",
          )}
        </span>
        {locationStatus === "ready" && <Icon name="check" size={17} />}
      </button>
      {locationStatus === "denied" && (
        <p className="nr-muted" role="status">
          {t("locationDenied")}
        </p>
      )}
    </>
  );
  if (screen === "home")
    return (
      <Sheet title={t("where")} subtitle={t("greeting")}>
        <button
          className="nr-search-button"
          onClick={() => navigate("destination")}
        >
          <Icon name="search" />
          <span>{t("destination")}</span>
          <Icon name="chevron" size={18} />
        </button>
        <div className="nr-quick-places">
          {["Bole Airport", "Meskel Square", "Edna Mall"].map((name, i) => (
            <button
              key={name}
              onClick={() => choose(places.find((p) => p.name === name)!)}
            >
              <Icon name={i === 0 ? "navigation" : i === 1 ? "pin" : "bag"} />
              <span>{name}</span>
            </button>
          ))}
        </div>
        <div className="nr-section-heading">
          <h2>{t("suggested")}</h2>
          <Icon name="clock" size={17} />
        </div>
        <div className="nr-list">
          {results.slice(0, 2).map((p) => (
            <ListRow
              key={p.name}
              icon="pin"
              title={p.name}
              detail={p.address}
              onClick={() => choose(p)}
            />
          ))}
        </div>
        <div className="nr-home-footer">
          <Icon name="shield" size={17} />
          <span>{t("brandMessage")}</span>
        </div>
      </Sheet>
    );
  if (screen === "destination")
    return (
      <Sheet title={t("where")} onBack={() => navigate("home")}>
        <div className="nr-route-input">
          <span className="nr-route-dot" />
          <label>
            {t("pickup")}
            <select
              value={gps ? "gps" : pickup.name}
              onChange={(e) => {
                setGps(null);
                setPickup(
                  places.find((p) => p.name === e.target.value) || places[0],
                );
              }}
            >
              {gps && <option value="gps">{t("locationReady")}</option>}
              {places
                .filter(
                  (p, i) => places.findIndex((a) => a.name === p.name) === i,
                )
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="nr-search-input">
          <Icon name="search" />
          <input
            aria-label={t("destination")}
            autoFocus
            placeholder={t("destination")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="nr-icon-button"
              onClick={() => setQuery("")}
              aria-label={t("clear")}
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
        {locationControl}
        <h2>{t(query ? "results" : "suggested")}</h2>
        <div className="nr-list">
          {results.map((p) => (
            <ListRow
              key={p.name}
              icon="pin"
              title={p.name}
              detail={p.address}
              onClick={() => choose(p)}
            />
          ))}
          {!results.length && <p className="nr-empty-text">{t("noResults")}</p>}
        </div>
      </Sheet>
    );
  if (screen === "rides")
    return (
      <Sheet title={t("chooseRide")} onBack={() => navigate("destination")}>
        <div className="nr-route-summary">
          <div>
            <span className="nr-route-dot" />
            <span>
              <small>{t("pickup")}</small>
              <strong>{gps ? t("locationReady") : pickup.name}</strong>
            </span>
          </div>
          <div>
            <span className="nr-route-dot end" />
            <span>
              <small>{t("dropoff")}</small>
              <strong>{destination?.name || t("destination")}</strong>
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
                    ? previewFare(gps || pickup, destination, r).amount
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
        <Button onClick={bookPreview} disabled={!destination}>
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

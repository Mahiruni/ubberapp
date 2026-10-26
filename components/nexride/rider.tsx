"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { places, type Place } from "../../lib/nexride-places";
import { type PreviewTrip } from "../../lib/nexride-preview";
import {
  Button,
  Icon,
  ListRow,
  Sheet,
  useTranslation,
  LanguageContext,
} from "./ui";
import { TripExperience } from "./trip-experience";
import { useRiderTrips } from "../../lib/nexride-use-trips";
import { tripStatus, type TripSnapshot } from "../../lib/nexride-trip-data";
import { RiderHomePanel } from "./rider-home";
import {
  emptyHomePlaces,
  HOME_PLACES_KEY,
  restoreHomePlaces,
  serializeHomePlaces,
  type HomePlaces,
} from "../../lib/nexride-home";
import { DestinationPanel, endpointName } from "./destination";
import { RideSelection } from "./ride-selection";
import { DriverMatching } from "./matching";
import type { Matching } from "../../lib/nexride-use-matching";
import type { RideCategory, RideFare } from "../../lib/nexride-booking";
import { placeKey, validPoint, type Endpoint } from "../../lib/nexride-search";
import type { Journey } from "../../lib/nexride-journey";
import type { RiderLocation, LocationStatus } from "../../lib/nexride-location";
import { emitNexRideFeedback } from "../../lib/nexride-feedback";
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
  onBookingPending,
  matching,
  onTripSource,
  onTripSnapshot,
  tripSelection,
  setTripSelection,
}: {
  tripSelection: { id: string; userId: string } | null;
  setTripSelection: (value: { id: string; userId: string } | null) => void;
  onTripSnapshot?: (snapshot: TripSnapshot | null) => void;
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
  onBookingPending: (pending: boolean) => void;
  matching: Matching;
  onTripSource: (live: boolean) => void;
}) {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const { pickup, destination } = journey;
  const [homePlaces, setHomePlaces] = useState<HomePlaces>(emptyHomePlaces);
  const [savingShortcut, setSavingShortcut] = useState<"home" | "work" | null>(
    null,
  );
  const [airportSearch, setAirportSearch] = useState(false);
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
  const realTrips = useRiderTrips();
  const selectedTripId = tripSelection && (!realTrips.userId || tripSelection.userId === realTrips.userId)
    ? tripSelection.id : null;
  const setSelectedTripId = (id: string | null) => setTripSelection(id && realTrips.userId
    ? { id, userId: realTrips.userId } : null);
  const openRealTrip = (id: string, state: unknown) => {
    setSelectedTripId(id);
    const status = tripStatus(state);
    navigate(status === "completed" ? "summary" : status === "in_trip" ? "live" : "trip");
  };
  const restoredAccount = useRef<string | null>(null);
  useEffect(() => {
    if (!realTrips.userId) { restoredAccount.current = null; return; }
    if (realTrips.loading || realTrips.cached || realTrips.error ||
      restoredAccount.current === realTrips.userId) return;
    // Restore once from a fresh, owned backend record. Account-scoped offline
    // data remains read-only and never starts matching or creates a booking.
    restoredAccount.current = realTrips.userId;
    if (screen !== 'home' || matching.request) return;
    const active = realTrips.rows.find(row => ['pending','accepted','arrived_pickup','in_trip'].includes(String(row.state)));
    if (!active) return;
    if (active.state !== 'pending') { openRealTrip(String(active.id), active.state); return; }
    const pickup: Endpoint = { lat: active.pickup_lat as number, lng: active.pickup_lng as number,
      name: String(active.pickup_address || ''), address: '', confirmed: true, source: 'provider' };
    const destination: Endpoint = { lat: active.destination_lat as number, lng: active.destination_lng as number,
      name: String(active.destination_address || ''), address: '', confirmed: true, source: 'provider' };
    const category = active.service_type;
    if (!validPoint(pickup) || !validPoint(destination) ||
      (category !== 'economy' && category !== 'comfort' && category !== 'xl')) return;
    journey.select('pickup', pickup); journey.select('destination', destination);
    matching.start({ requestId: String(active.id), source: 'service',
      journey: { pickup, destination, routeState: { key: '', status: 'idle' } },
      fare: { id: `restored:${active.id}`, category, seats: category === 'xl' ? 6 : 4,
        availability: 'available', pickupMinutes: null,
        amount: typeof active.total_minor === 'number' ? active.total_minor / 100 : null,
        currency: 'ETB', priceType: 'estimate', charges: [] } });
    navigate('finding');
  }, [realTrips.userId, realTrips.loading, realTrips.cached, realTrips.error, realTrips.rows, screen, matching, journey, navigate]);
  useEffect(() => {
    if (
      screen !== "finding" ||
      matching.request?.source !== "service" ||
      matching.snapshot?.status !== "assigned"
    )
      return;
    setSelectedTripId(matching.request.requestId);
    emitNexRideFeedback({
      event: "driver_assigned",
      id: matching.request.requestId,
      title: "Driver assigned",
      body: "Your Biloo driver is on the way.",
      url: "/",
    });
    matching.clear();
    navigate("trip");
  }, [
    screen,
    matching.request?.requestId,
    matching.request?.source,
    matching.snapshot?.status,
  ]);
  useEffect(() => { onTripSource(!!selectedTripId && !!realTrips.userId && ["trip","live","summary"].includes(screen)); }, [selectedTripId, realTrips.userId, screen, onTripSource]);
  const choose = (p: Place) => {
    setAirportSearch(false);
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
  const bookPreview = (category: RideCategory, amount: number) => {
    if (
      !destination ||
      !pickup ||
      !journey.canContinue ||
      !Number.isFinite(amount)
    )
      return;
    setSelectedTripId(null);
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
      ride: category,
      amount,
      completed: false,
      rating: 0,
    });
    matching.start({ requestId: crypto.randomUUID(), source: "preview", journey: { pickup, destination, routeState: journey.routeState },
      fare: { id: 'preview', category, seats: category === 'xl' ? 6 : 4, availability: 'preview', pickupMinutes: null, amount, currency: 'ETB', priceType: 'sample', charges: [] } });
    navigate("finding");
  };
  if (screen === "home")
    return (
      <>
      {realTrips.active && <button className="nr-resume-trip" onClick={() => openRealTrip(String(realTrips.active!.id), realTrips.active!.state)}>{realTrips.cached ? "Review saved trip · Reconnecting" : "Resume your trip"} <Icon name="arrow" /></button>}
      <RiderHomePanel
        navigate={() => {
          setSavingShortcut(null);
          setAirportSearch(false);
          navigate("destination");
        }}
        airport={() => {
          setSavingShortcut(null);
          journey.clear("destination");
          setAirportSearch(true);
          navigate("destination");
        }}
        choose={choose}
        data={homePlaces}
        status={locationStatus}
        position={position}
        locationLabel={
          journey.pickup?.source === "device"
            ? endpointName(journey.pickup, language, t)
            : undefined
        }
        shortcut={(kind) => {
          setAirportSearch(false);
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
      </>
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
              setAirportSearch(false);
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
        initialDestinationQuery={airportSearch ? "Bole International Airport" : undefined}
        journey={journey}
        back={() => {
          setSavingShortcut(null);
          setAirportSearch(false);
          navigate("home");
        }}
        proceed={() => {
          if (journey.canContinue) {
            setAirportSearch(false);
            navigate("rides");
          }
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
      <RideSelection
        journey={journey}
        back={() => navigate("destination")}
        preview={bookPreview}
        onPending={onBookingPending}
        onCreated={(requestId: string, fare: RideFare) => {
          matching.start({ requestId, source: 'service', fare, journey: { pickup, destination, routeState: journey.routeState } });
          navigate('finding');
        }}
      />
    );
  if (screen === "finding")
    return <DriverMatching model={matching}
      home={() => { matching.clear(); navigate('home'); }}
      changeCategory={() => { matching.clear(); navigate('rides'); }}
      previewAssigned={() => { setSelectedTripId(null); matching.clear(); navigate('trip'); }} />;
  if (screen === "trip" || screen === "live" || screen === "summary")
    return <TripExperience onSnapshot={onTripSnapshot} screen={screen} tripId={selectedTripId} userId={realTrips.userId} preview={trip}
      navigate={navigate} setPreview={setTrip} safety={onSafety} onCancelled={() => void realTrips.refresh()} />;
  if (screen === "wallet")
    return (
      <Sheet title={t("wallet")}>
        <div className="nr-balance-card">
          <small>{t("paymentMethods")}</small>
          <strong>{t("cash")}</strong>
          <p>Pay the driver after your trip. Online payment appears only when it is enabled for your ride.</p>
          <Button onClick={() => window.location.assign("/rider/wallet")}>
            Open payments
          </Button>
        </div>
      </Sheet>
    );
  return (
    <Sheet title={t("history")}>
      {realTrips.userId && <section className="nr-real-trip-history" aria-label="Your booked trips">
        {realTrips.loading && <p role="status">Loading your trips…</p>}
        {realTrips.cached && <p className="nr-muted" role="status">Saved trip history · Last confirmed details only. Changes are verified automatically when your connection returns.</p>}
        {realTrips.error && <div role="alert"><p>We couldn’t refresh your rides. Previously loaded details may be out of date.</p><Button variant="secondary" onClick={() => void realTrips.refresh()}>Try again</Button></div>}
        {realTrips.rows.map(row => <ListRow key={String(row.id)} icon={row.state === 'completed' ? 'check' : 'navigation'}
          title={String(row.destination_address || 'Destination unavailable')}
          detail={`${String(row.state).replaceAll('_', ' ')} · ${String(row.id).slice(0, 8)}`}
          onClick={() => openRealTrip(String(row.id), row.state)} />)}
        {!realTrips.loading && !realTrips.error && !realTrips.rows.length && <p>No rides here yet.</p>}
      </section>}
      {trip ? (
        <>
          <p className="nr-muted">{t("recent")}</p>
          <div className="nr-list">
            <ListRow
              icon={trip.completed ? "check" : "navigation"}
              title={trip.destination}
              detail={`${t(trip.ride)} · ${trip.amount} ETB · ${t("sample")}`}
              onClick={() => { setSelectedTripId(null); navigate(trip.completed ? "summary" : "trip"); }}
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

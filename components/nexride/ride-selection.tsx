"use client";
import Link from "next/link";
import { useContext, useEffect, useState } from "react";
import { Button, Dialog, Icon, LanguageContext, useTranslation } from "./ui";
import { endpointName } from "./destination";
import { RiderSheetHandle } from "./rider-sheet";
import styles from "./booking-interface.module.css";
import {
  fareTotal,
  rideCategories,
  type RideCategory,
  type RideFare,
} from "../../lib/nexride-booking";
import { useRideOffers } from "../../lib/nexride-offers";
import type { Journey } from "../../lib/nexride-journey";
const money = (amount: number) =>
  new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 }).format(amount);
export function RideSelection({
  journey,
  back,
  preview,
  onPending,
  onCreated,
}: {
  journey: Journey;
  back: () => void;
  preview: (category: RideCategory, amount: number) => void;
  onPending: (pending: boolean) => void;
  onCreated: (requestId: string, fare: RideFare) => void;
}) {
  const t = useTranslation(),
    language = useContext(LanguageContext);
  const model = useRideOffers(journey, onPending, onCreated);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pickupInstructions, setPickupInstructions] = useState("");
  const say = (en: string, am: string) => language === "am" ? am : en;
  useEffect(() => {
    if (!model.canRequest) setConfirmOpen(false);
  }, [model.canRequest]);
  const busy = model.requestState === "pending",
    accepted = model.requestState === "accepted";
  const total =
    model.loadState === "ready" && model.chosen
      ? fareTotal(model.chosen)
      : null;
  return (
    <section className={`nr-ride-selection ${styles.screen} ${styles.selection}`} aria-label={t("chooseRide")}>
      <RiderSheetHandle
        label={language === "am" ? "የጉዞ አማራጭ ፓነሉን አስፋ ወይም አሳንስ" : "Resize ride options panel"}
        defaultRatio={0.72}
        desktopDefaultRatio={0.86}
        snaps={[0.32, 0.72, 0.86]}
        scrollSelector=".nr-ride-selection-body"
        storageKey="nexride.rider.sheet.rides"
      />
      <header>
        <div className="nr-ride-heading-copy">
          <span>{language === "am" ? "ለዚህ ጉዞ የሚገኙ አማራጮች" : "Best options for this trip"}</span>
          <h1>{t("chooseRide")}</h1>
        </div>
        <button
          className="nr-icon-button"
          aria-label={t("editJourney")}
          onClick={back}
          disabled={busy || accepted}
        >
          <Icon name="pin" size={18} />
        </button>
      </header>
      <div className="nr-ride-selection-body">
        <div className="nr-ride-route-line">
          <span className="nr-route-dot" />
          <span>
            {journey.pickup
              ? endpointName(journey.pickup, language, t)
              : t("selectPickup")}
          </span>
          <Icon name="arrow" size={16} />
          <span className="nr-route-dot end" />
          <span>
            {journey.destination
              ? endpointName(journey.destination, language, t)
              : t("destination")}
          </span>
        </div>
        {journey.routeState.status === "ready" &&
          journey.routeState.route && (
            <div
              className="nr-ride-route-meta"
              data-traffic={
                journey.routeState.route.traffic?.level || "unavailable"
              }
            >
              <span>
                <Icon name="clock" size={15} />
                {Math.max(
                  1,
                  Math.round(journey.routeState.route.durationSeconds / 60),
                )}{" "}
                {t("minutes")}
              </span>
              <span>
                {(journey.routeState.route.distanceMeters / 1000).toFixed(1)}{" "}
                {t("kilometers")}
              </span>
            </div>
          )}
        {journey.routeState.status === "unavailable" && (
          <p className="nr-ride-route-unavailable">{t("noRoadRoute")}</p>
        )}
        {model.loadState === "loading" ? (
          <FareSkeleton />
        ) : model.loadState === "error" ? (
          <div className="nr-fare-state" role="alert">
            <Icon name="info" />
            <p>
              {model.loadError === "auth"
                ? "Your Biloo session is not active. Sign in to book a real ride."
                : model.loadError === "profile"
                  ? "Your Biloo account is recognized. Complete the missing Rider details to book."
                  : model.loadError === "offline"
                    ? "You are currently Online as a Driver or handling a trip. Go Offline and finish active trips before requesting as a Rider."
                    : model.loadError === "role"
                      ? "Use your existing Biloo account to activate Rider access. A second account is not needed."
                      : model.loadError === "suspended"
                        ? "This account cannot book rides right now. Contact Biloo support."
                        : model.loadError === "journey"
                          ? "Choose a valid pickup and destination within the service area."
                          : t("faresFailed")}
            </p>
            {model.loadError === "auth" ? (
              <Link href="/rider/sign-in" className="nr-preview-ride-link">
                {t("signIn")} <Icon name="arrow" size={16} />
              </Link>
            ) : model.loadError === "profile" ? (
              <Link href="/rider/complete-profile" className="nr-preview-ride-link">
                Complete Rider profile <Icon name="arrow" size={16} />
              </Link>
            ) : model.loadError === "offline" ? (
              <Link href="/driver/home" className="nr-preview-ride-link">
                Go Offline as Driver <Icon name="arrow" size={16} />
              </Link>
            ) : model.loadError === "role" ? (
              <Link href="/rider" className="nr-preview-ride-link">
                Enable Rider access <Icon name="arrow" size={16} />
              </Link>
            ) : model.loadError === "suspended" ? (
              <Link href="/support?role=rider" className="nr-preview-ride-link">
                Contact support <Icon name="arrow" size={16} />
              </Link>
            ) : model.loadError === "journey" ? (
              <Button variant="secondary" onClick={back}>{t("editJourney")}</Button>
            ) : (
              <Button variant="secondary" onClick={model.load}>{t("tryAgain")}</Button>
            )}
          </div>
        ) : (
          <>
            <p className="nr-fare-source">
              {t(
                model.fares?.source === "preview"
                  ? "previewCategories"
                  : "servicePrices",
              )}
            </p>
            <div
              className="nr-ride-options"
              role="radiogroup"
              aria-label={t("chooseRide")}
            >
              {rideCategories.map((category) => {
                const offer = model.fares!.offers.find(
                  (o) => o.category === category,
                )!;
                return (
                  <RideOption
                    key={category}
                    fare={offer}
                    selected={model.selected === category}
                    disabled={
                      busy ||
                      accepted ||
                      !!model.changed ||
                      offer.availability === "unavailable"
                    }
                    onSelect={() => model.setSelected(category)}
                    onArrow={(direction) => {
                      const available = rideCategories.filter(
                        (c) =>
                          model.fares!.offers.find((o) => o.category === c)!
                            .availability !== "unavailable",
                      );
                      const next =
                        available[
                          (available.indexOf(category) +
                            direction +
                            available.length) %
                            available.length
                        ];
                      if (next) {
                        model.setSelected(next);
                        document.getElementById(`ride-${next}`)?.focus();
                      }
                    }}
                  />
                );
              })}
            </div>
            {model.chosen?.availability === "unavailable" && (
              <p className="nr-fare-state" role="status">
                {t("categoryUnavailable")}
              </p>
            )}
            {model.changed && (
              <div className="nr-fare-state" role="alert">
                <strong>{t("pricingChanged")}</strong>
                <p>{t("reviewPricing")}</p>
                {model.changed.old !== null && model.changed.next !== null && (
                  <p>
                    <del>ETB {money(model.changed.old)}</del>
                    <span> → ETB {money(model.changed.next)}</span>
                  </p>
                )}
                <Button variant="secondary" onClick={model.acceptPrice}>
                  {t("acceptPricing")}
                </Button>
              </div>
            )}
            {model.chosen && (
              <details className="nr-fare-explanation">
                <summary><strong>
                  {t(
                    model.chosen.priceType === "sample"
                      ? "sampleFare"
                      : model.chosen.priceType === "estimate"
                        ? "estimatedFare"
                        : "confirmedFare",
                  )}
                </strong><Icon name="chevron" size={16} /></summary>
                <p>
                  {t(
                    model.chosen.priceType === "sample"
                      ? "samplePriceNote"
                      : model.chosen.priceType === "estimate"
                        ? "estimatePriceNote"
                        : "confirmedPriceNote",
                  )}
                </p>
                {model.fares?.chargesComplete ? (
                  <div className="nr-fare-breakdown">
                    <div>
                      <span>{t("rideFare")}</span>
                      <span>
                        ETB{" "}
                        {model.chosen.amount === null
                          ? "—"
                          : money(model.chosen.amount)}
                      </span>
                    </div>
                    {model.chosen.charges.map((c, index) => (
                      <div key={`${c.name}-${index}`}>
                        <span>{c.name}</span>
                        <span>ETB {money(c.amount)}</span>
                      </div>
                    ))}
                    {!model.chosen.charges.length && (
                      <p>{t("noQuotedCharges")}</p>
                    )}
                    {total !== null && (
                      <div className="total">
                        <strong>{t("totalQuote")}</strong>
                        <strong>ETB {money(total)}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="nr-charges-unavailable">
                    {t("chargesUnavailable")}
                  </p>
                )}
              </details>
            )}
          </>
        )}
        {["failed", "unavailable", "unknown"].includes(model.requestState) && (
          <div className="nr-fare-state" role="alert">
            <strong>{t("rideRequestFailed")}</strong>
            <p>
              {t(
                model.requestState === "unknown"
                  ? "requestUnknown"
                  : model.requestState === "unavailable"
                    ? "requestUnavailable"
                    : "requestFailedNote",
              )}
            </p>
          </div>
        )}
        {accepted && (
          <div className="nr-request-received" role="status">
            <Icon name="check" />
            <strong>{t("requestReceived")}</strong>
            <p>{t("requestReceivedNote")}</p>
            <small>{model.requestId}</small>
          </div>
        )}
      </div>
      <footer>
        <div className="nr-ride-payment">
          <Icon name="wallet" />
          <span className="nr-payment-details">
            <small>{t("payment")}</small>
            <strong>{t("cash")}</strong>
          </span>
          <button
            className="nr-text-button"
            aria-label={t("editPayment")}
            onClick={() => setPaymentOpen(true)}
            disabled={busy || accepted}
          >
            {t("edit")}
          </button>
        </div>
        <Button
          className={styles.primaryAction}
          onClick={() => {
            if (model.canRequest) setConfirmOpen(true);
          }}
          disabled={!model.canRequest}
          aria-label={say("Continue to review ride", "ጉዞውን ለመገምገም ይቀጥሉ")}
        >
          {busy ? (
            <>
              <span className="nr-request-spinner" />
              {t("requestingRide")}
            </>
          ) : accepted ? (
            t("requestReceived")
          ) : (
            say("Continue", "ቀጥል")
          )}
          {!busy && !accepted && total !== null && (
            <span className="nr-request-total">ETB {money(total)}</span>
          )}
        </Button>
        {model.fares?.source === "preview" && (
          <>
            <small className="nr-booking-boundary">
              {model.fares.previewReason === "service_unavailable"
                ? "Live fares are temporarily unreachable. Only sample prices are shown."
                : "Sign in with your Rider account to enable live booking."}
            </small>
            {model.fares.previewReason === "service_unavailable" ? (
              <button className="nr-preview-ride-link" onClick={model.load}>
                {t("tryAgain")} <Icon name="arrow" size={16} />
              </button>
            ) : (
              <Link href="/rider/sign-in" className="nr-preview-ride-link">
                {t("signIn")} <Icon name="arrow" size={16} />
              </Link>
            )}
            <button
              className="nr-preview-ride-link"
              disabled={!model.canPreview}
              onClick={() => {
                if (model.canPreview && total !== null)
                  preview(model.selected, total);
              }}
            >
              {t("previewRide")}
              <Icon name="arrow" size={16} />
            </button>
          </>
        )}
        {model.fares?.source === "service" && !model.fares.chargesComplete && (
          <small className="nr-booking-boundary">
            {t("chargesUnavailable")}
          </small>
        )}
        {busy && (
          <small role="status" className="nr-booking-boundary">
            {t("requestPendingNote")}
          </small>
        )}
      </footer>
      {confirmOpen && model.chosen && (
        <Dialog
          className={styles.review}
          fitViewport
          title={t("reviewRequest")}
          onClose={() => setConfirmOpen(false)}
        >
          <div className={styles.reviewBody} role="region" aria-label={say("Ride review details", "የጉዞ ግምገማ ዝርዝሮች")}>
          <div className="biloo-booking-review">
            <span className="biloo-journey-eyebrow">{say("YOUR JOURNEY", "የእርስዎ ጉዞ")}</span>
            <div className="biloo-journey-stops">
              <div><span className="biloo-stop-dot"/><div><small>{t("pickup")}</small><strong>{journey.pickup && endpointName(journey.pickup, language, t)}</strong></div></div>
              <div><span className="biloo-stop-dot destination"/><div><small>{t("dropoff")}</small><strong>{journey.destination && endpointName(journey.destination, language, t)}</strong></div></div>
            </div>
            {journey.routeState.status === "ready" && journey.routeState.route && <div className="biloo-journey-metrics">
              <span><Icon name="navigation" size={16}/>{(journey.routeState.route.distanceMeters / 1000).toFixed(1)} {t("kilometers")}</span>
              <span><Icon name="clock" size={16}/>{Math.max(1, Math.ceil(journey.routeState.route.durationSeconds / 60))} {t("minutes")}</span>
              <span><Icon name="user" size={16}/>{model.chosen.seats} {t("seats")}</span>
            </div>}
          </div>
          <p className="nr-muted">
            {t(
              model.chosen.priceType === "confirmed"
                ? "confirmedPriceNote"
                : "estimatePriceNote",
            )}
          </p>
          <div className="nr-fare-breakdown biloo-booking-fares">
            <div>
              <strong>{t(model.selected)}</strong>
              <span>
                ETB{" "}
                {model.chosen.amount === null
                  ? "—"
                  : money(model.chosen.amount)}
              </span>
            </div>
            {model.chosen.charges.map((charge, index) => (
              <div key={`${charge.name}-${index}`}>
                <span>{charge.name}</span>
                <span>ETB {money(charge.amount)}</span>
              </div>
            ))}
            {!model.chosen.charges.length && <p>{t("noQuotedCharges")}</p>}
            <div className="total">
              <strong>{model.chosen.priceType === "confirmed" ? t("totalQuote") : say("Estimated total", "ግምታዊ ጠቅላላ ዋጋ")}</strong>
              <strong>ETB {total === null ? "—" : money(total)}</strong>
            </div>
            <p>
              {t("payment")}: {t("cash")}
            </p>
          </div>
          <label className="biloo-pickup-note">
            <span>{say("Pickup instructions", "የመነሻ መመሪያ")} <small>{say("Optional", "አማራጭ")}</small></span>
            <textarea value={pickupInstructions} maxLength={280} rows={2}
              placeholder={say("Entrance, landmark, or where to meet", "መግቢያ፣ ምልክት ወይም የመገናኛ ቦታ")}
              onChange={event => setPickupInstructions(event.target.value)} />
          </label>
          <p className="biloo-booking-assurance"><Icon name="shield" size={16}/>{say("Your ride is confirmed after a driver accepts. Payment is not collected now.", "ጉዞዎ የሚረጋገጠው አሽከርካሪ ሲቀበል ነው። አሁን ክፍያ አይሰበሰብም።")}</p>
          </div>
          <div className={styles.reviewFooter}>
          <Button
            className={styles.primaryAction}
            aria-label={t("requestRide")}
            disabled={!model.canRequest}
            onClick={() => {
              if (model.canRequest) {
                setConfirmOpen(false);
                void model.request(pickupInstructions.trim());
              }
            }}
          >
            {t("requestRide")}
            {total !== null && <span className={styles.reviewTotal}>ETB {money(total)}</span>}
          </Button>
          </div>
        </Dialog>
      )}
      {paymentOpen && (
        <Dialog title={t("payment")} onClose={() => setPaymentOpen(false)}>
          <p className="nr-muted">
            {t(
              model.fares?.source === "preview"
                ? "previewPaymentNote"
                : "cashPaymentNote",
            )}
          </p>
          <div
            className="nr-payment-choices"
            role="radiogroup"
            aria-label={t("payment")}
          >
            <button
              role="radio"
              aria-checked="true"
              onClick={() => setPaymentOpen(false)}
            >
              <Icon name="money" />
              <strong>{t("cash")}</strong>
              <Icon name="check" />
            </button>
            {(["mobileMoney", "cardPayment"] as const).map((method) => (
              <button key={method} role="radio" aria-checked="false" disabled>
                <Icon name="wallet" />
                <span>{t(method)}</span>
                <small>{t("unavailable")}</small>
              </button>
            ))}
          </div>
          <Button onClick={() => setPaymentOpen(false)}>{t("done")}</Button>
        </Dialog>
      )}
    </section>
  );
}
function RideVehicleIcon({ category }: { category: RideFare["category"] }) {
  return <span className={`nr-ride-vehicle ${styles.vehicle}`} data-category={category} aria-hidden="true">
    <img className="nr-vehicle-art" src={`/brand/vehicles/${category}-3d.webp`} width={152} height={104} alt="" decoding="async" />
  </span>;
}

function RideOption({
  fare,
  selected,
  disabled,
  onSelect,
  onArrow,
}: {
  fare: RideFare;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onArrow: (direction: number) => void;
}) {
  const t = useTranslation();
  const total = fareTotal(fare),
    unavailable = fare.availability === "unavailable";
  return (
    <button
      id={`ride-${fare.category}`}
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={`nr-ride-card ${selected ? "selected" : ""} ${unavailable ? "unavailable" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (
          ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)
        ) {
          e.preventDefault();
          onArrow(e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <RideVehicleIcon category={fare.category} />
      <span className="nr-ride-copy">
        <strong>{t(fare.category)}{selected && <span className="nr-ride-selected-indicator" aria-hidden="true"><Icon name="check" size={12} /></span>}</strong>
        <small>
          <Icon name="user" size={13} />
          {fare.seats} {t("seats")}
        </small>
        <small>
          {unavailable
            ? t("categoryUnavailableShort")
            : fare.pickupMinutes === null
              ? t("pickupEstimateUnavailable")
              : `${fare.pickupMinutes} ${t("minutes")} · ${t("pickup")}`}
        </small>
      </span>
      <span className="nr-ride-price">
        <strong>
          <span>ETB </span>
          {total === null ? "—" : money(total)}
        </strong>
        <small>
          {unavailable
            ? null
            : t(
                fare.priceType === "sample"
                  ? "sample"
                  : fare.priceType === "estimate"
                    ? "estimated"
                    : "confirmed",
              )}
        </small>
      </span>
    </button>
  );
}
function FareSkeleton() {
  const t = useTranslation();
  return (
    <div className="nr-fare-loading" role="status" aria-busy="true">
      <p>{t("loadingFares")}</p>
      {rideCategories.map((c) => (
        <div key={c} className="nr-fare-skeleton">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

"use client";
import { useContext, useEffect, useState } from "react";
import { Button, Dialog, Icon, LanguageContext, useTranslation } from "./ui";
import { endpointName } from "./destination";
import { RiderSheetHandle } from "./rider-sheet";
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
    <section className="nr-ride-selection" aria-label={t("chooseRide")}>
      <RiderSheetHandle
        label={language === "am" ? "የጉዞ አማራጭ ፓነሉን አስፋ ወይም አሳንስ" : "Resize ride options panel"}
        defaultRatio={0.62}
        snaps={[0.28, 0.62, 0.75]}
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
              <span className="nr-ride-traffic">
                <i aria-hidden="true" />
                {journey.routeState.route.traffic
                  ? t(
                      journey.routeState.route.traffic.level === "low"
                        ? "trafficLow"
                        : journey.routeState.route.traffic.level === "moderate"
                          ? "trafficModerate"
                          : journey.routeState.route.traffic.level === "heavy"
                            ? "trafficHeavy"
                            : "trafficSevere",
                    )
                  : t("trafficUnavailable")}
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
            <p>{t("faresFailed")}</p>
            <Button variant="secondary" onClick={model.load}>
              {t("tryAgain")}
            </Button>
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
              <div className="nr-fare-explanation">
                <strong>
                  {t(
                    model.chosen.priceType === "sample"
                      ? "sampleFare"
                      : model.chosen.priceType === "estimate"
                        ? "estimatedFare"
                        : "confirmedFare",
                  )}
                </strong>
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
              </div>
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
          <span>
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
          onClick={() => {
            if (model.canRequest) setConfirmOpen(true);
          }}
          disabled={!model.canRequest}
          aria-label={language === "am" ? t("requestRide") : `Request ${t(model.selected)}`}
        >
          {busy ? (
            <>
              <span className="nr-request-spinner" />
              {t("requestingRide")}
            </>
          ) : accepted ? (
            t("requestReceived")
          ) : (
            language === "am" ? t("requestRide") : `Request ${t(model.selected)}`
          )}
          {!busy && !accepted && total !== null && (
            <span className="nr-request-total">ETB {money(total)}</span>
          )}
        </Button>
        {model.fares?.source === "preview" && (
          <>
            <small className="nr-booking-boundary">
              {t("requestUnavailable")}
            </small>
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
          title={t("reviewRequest")}
          onClose={() => setConfirmOpen(false)}
        >
          <p className="nr-muted">
            {t(
              model.chosen.priceType === "confirmed"
                ? "confirmedPriceNote"
                : "estimatePriceNote",
            )}
          </p>
          <div className="nr-fare-breakdown">
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
              <strong>{t("totalQuote")}</strong>
              <strong>ETB {total === null ? "—" : money(total)}</strong>
            </div>
            <p>
              {t("payment")}: {t("cash")}
            </p>
          </div>
          <Button
            disabled={!model.canRequest}
            onClick={() => {
              if (model.canRequest) {
                setConfirmOpen(false);
                void model.request();
              }
            }}
          >
            {t("confirmRequest")}
          </Button>
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
  const isXL = category === "xl";
  const isComfort = category === "comfort";
  return (
    <span
      className="nr-ride-vehicle"
      data-category={category}
      aria-hidden="true"
    >
      <svg viewBox="0 0 72 44" role="presentation" focusable="false">
        <path
          className="nr-ride-vehicle-shadow"
          d="M14 36.5c0 2.5 7.5 4.5 22 4.5s22-2 22-4.5H14Z"
        />
        <path
          className="nr-ride-vehicle-shell"
          d={
            isXL
              ? "M9 26.5 14.2 14c1.2-2.9 3.4-4.5 6.5-4.5h30.6c3.1 0 5.3 1.6 6.5 4.5L63 26.5v6.2c0 2-1.6 3.6-3.6 3.6h-4.1c-1.8 0-3.3-1.3-3.6-3H20.3c-.3 1.7-1.8 3-3.6 3h-4.1c-2 0-3.6-1.6-3.6-3.6v-6.2Z"
              : isComfort
                ? "M10 27 15.5 15.8c1.3-2.7 3.2-4 6.1-4h28.8c2.9 0 4.8 1.3 6.1 4L62 27v5.6c0 2-1.6 3.6-3.6 3.6h-3.7c-1.7 0-3.1-1.2-3.5-2.8H20.8c-.4 1.6-1.8 2.8-3.5 2.8h-3.7c-2 0-3.6-1.6-3.6-3.6V27Z"
                : "M11 27.5 16.2 17c1.2-2.5 3.1-3.8 5.8-3.8h28c2.7 0 4.6 1.3 5.8 3.8L61 27.5v5c0 1.9-1.5 3.4-3.4 3.4h-3.4c-1.6 0-3-1.1-3.3-2.6H21.1c-.3 1.5-1.7 2.6-3.3 2.6h-3.4c-1.9 0-3.4-1.5-3.4-3.4v-5Z"
          }
        />
        <path
          className="nr-ride-vehicle-glass"
          d={
            isXL
              ? "M20 14.1h31.8l4 10H16l4-10Z"
              : "M21.1 16.1h29.8l3.7 8.5H17.4l3.7-8.5Z"
          }
        />
        <path className="nr-ride-vehicle-light" d="M14.2 28.1h8v3.4h-8zm35.6 0h8v3.4h-8z" />
        <path className="nr-ride-vehicle-grille" d="M27 29.2h18c1 0 1.8.8 1.8 1.8v1.1H25.2V31c0-1 .8-1.8 1.8-1.8Z" />
        <circle className="nr-ride-vehicle-wheel" cx="19" cy="34.5" r="3.2" />
        <circle className="nr-ride-vehicle-wheel" cx="53" cy="34.5" r="3.2" />
      </svg>
    </span>
  );
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
        <strong>{t(fare.category)}</strong>
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
      {selected && <span className="nr-ride-selected-indicator" aria-hidden="true"><Icon name="check" size={13} /></span>}
      <span className="nr-ride-price">
        <strong>
          <span>ETB </span>
          {total === null ? "—" : money(total)}
        </strong>
        <small>
          {unavailable
            ? t("unavailable")
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

/** BILOO approved Economy tariff. Fare amounts are in ETB. */
export const BILOO_ECONOMY_TARIFF = Object.freeze({
  baseFareEtb: 160,
  minimumFareEtb: 160,
  perKilometerEtb: 20,
  perMinuteEtb: 3,
  revision: "biloo-economy-2026-10-29",
});
/** A bookable quote must use verified road-route distance and duration. */
export function calculateBilooFare(distanceKm: number, durationMinutes: number, adjustmentEtb = 0) {
  if (![distanceKm, durationMinutes, adjustmentEtb].every(Number.isFinite) || distanceKm < 0 || durationMinutes < 0)
    throw new Error("invalid_fare_inputs");
  const { baseFareEtb, minimumFareEtb, perKilometerEtb, perMinuteEtb } = BILOO_ECONOMY_TARIFF;
  return Math.max(minimumFareEtb, Math.round(baseFareEtb + distanceKm * perKilometerEtb + durationMinutes * perMinuteEtb + adjustmentEtb));
}

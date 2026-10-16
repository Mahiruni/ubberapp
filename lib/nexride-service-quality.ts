/** Operational aggregates only. Rider identifiers never leave the server. */
export type QualityTrip = {
  status: string; created_at: string; accepted_at: string | null;
  rider_id: string | null; cancelled_by: string | null;
};
export function summarizeServiceQuality(trips: QualityTrip[]) {
  let completed = 0, cancelled = 0, withdrawn = 0, matchSeconds = 0, matchedSamples = 0;
  let riderCancellations = 0, driverCancellations = 0;
  const completedRiders = new Map<string, number>();
  for (const trip of trips) {
    if (trip.status === "completed") {
      completed++;
      if (trip.rider_id) completedRiders.set(trip.rider_id, (completedRiders.get(trip.rider_id) || 0) + 1);
    }
    if (trip.status === "cancelled") {
      cancelled++;
      if (trip.cancelled_by === "rider") riderCancellations++;
      if (trip.cancelled_by === "driver") driverCancellations++;
    }
    if (trip.status === "withdrawn") withdrawn++;
    if (trip.accepted_at) {
      const elapsed = (Date.parse(trip.accepted_at) - Date.parse(trip.created_at)) / 1000;
      if (Number.isFinite(elapsed) && elapsed >= 0) { matchSeconds += elapsed; matchedSamples++; }
    }
  }
  const closed = completed + cancelled + withdrawn;
  return {
    observedRequests: trips.length, completed, cancelled, withdrawn, riderCancellations, driverCancellations,
    unattributedCancellations: cancelled - riderCancellations - driverCancellations,
    closedCompletionPercent: closed ? Math.round(completed / closed * 1000) / 10 : null,
    meanMatchSeconds: matchedSamples ? Math.round(matchSeconds / matchedSamples) : null,
    matchedSamples,
    repeatCompletedRiders: [...completedRiders.values()].filter(count => count >= 2).length,
    completedRiders: completedRiders.size,
  };
}
export type ServiceQualitySummary = ReturnType<typeof summarizeServiceQuality>;

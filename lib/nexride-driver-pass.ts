export type DriverPassOutcome = "forwarded" | "other_pending" | "no_drivers";
export type DriverPassResponse = {
  status?: string;
  requestId?: string;
  forwarded?: boolean;
  anotherOfferActive?: boolean;
};
/** Never announce that an offer was forwarded without server confirmation. */
export function resolveDriverPassOutcome(
  response: DriverPassResponse | null,
  requestId: string,
): DriverPassOutcome | null {
  if (!response || response.status !== "passed" || response.requestId !== requestId) return null;
  return response.forwarded ? "forwarded" :
    response.anotherOfferActive ? "other_pending" : "no_drivers";
}

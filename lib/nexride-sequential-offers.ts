/** Interpret only server-confirmed sequential driver offer decisions. */
export type DriverOfferAction = "accept" | "decline" | "pass" | "expire";
export function confirmedDriverOfferDecision(
  action: DriverOfferAction,
  response: { status?: string; requestId?: string } | null,
  requestId: string,
) {
  const expected: Record<DriverOfferAction, string> = {
    accept: "accepted", decline: "declined", pass: "passed", expire: "expired",
  };
  return Boolean(response && response.status === expected[action] &&
    (action === "expire" || response.requestId === requestId));
}

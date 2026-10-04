import type { MessageKey } from "./nexride-i18n";
import type { Place } from "./nexride-places";
export const rideOptions: {
  id: MessageKey;
  description: MessageKey;
  seats: number;
  base: number;
  perKm: number;
  perMin: number;
}[] = [
  {
    id: "economy",
    description: "everyday",
    seats: 4,
    base: 70,
    perKm: 25,
    perMin: 3,
  },
  {
    id: "comfort",
    description: "quieter",
    seats: 4,
    base: 90,
    perKm: 35,
    perMin: 4,
  },
  {
    id: "premium",
    description: "elevated",
    seats: 4,
    base: 120,
    perKm: 55,
    perMin: 6,
  },
  { id: "xl", description: "group", seats: 6, base: 100, perKm: 40, perMin: 4 },
];
export function distanceKm(
  a: Pick<Place, "lat" | "lng">,
  b: Pick<Place, "lat" | "lng">,
) {
  const rad = Math.PI / 180;
  const v =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}
// Preview calculation boundary. Replace with an authenticated routing/fare service when connected.
export function previewFare(
  pickup: Pick<Place, "lat" | "lng">,
  destination: Place,
  ride: (typeof rideOptions)[number],
) {
  const distance = Math.max(0.5, distanceKm(pickup, destination) * 1.28);
  const duration = Math.max(4, Math.ceil((distance / 22) * 60));
  return {
    distance,
    duration,
    amount: Math.max(
      100,
      Math.round(ride.base + ride.perKm * distance + ride.perMin * duration),
    ),
  };
}
export type PreviewProfile = { name: string; phone: string; email: string };
export type PreviewTrip = {
  pickup: string;
  destination: string;
  ride: MessageKey;
  amount: number;
  completed: boolean;
  rating: number;
};

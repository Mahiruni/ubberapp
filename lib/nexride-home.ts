import { places, type Place } from "./nexride-places";
export const HOME_PLACES_KEY = "nexride:rider-places-v1";
export type HomePlaces = {
  saved: { home?: Place; work?: Place };
  recent: Place[];
};
export const emptyHomePlaces = (): HomePlaces => ({ saved: {}, recent: [] });
// These are local preview selections, never a server ride history or live geocoder response.
export function restoreHomePlaces(raw: string | null): HomePlaces {
  try {
    const data = JSON.parse(raw || "{}");
    const find = (value: unknown) => places.find((p) => p.name === value);
    const home = find(data.saved?.home),
      work = find(data.saved?.work);
    const recent: Place[] = [];
    for (const name of Array.isArray(data.recent) ? data.recent : []) {
      const p = find(name);
      if (p && !recent.some((a) => a.name === p.name)) recent.push(p);
      if (recent.length === 5) break;
    }
    return {
      saved: { ...(home ? { home } : {}), ...(work ? { work } : {}) },
      recent,
    };
  } catch {
    return emptyHomePlaces();
  }
}
export function serializeHomePlaces(data: HomePlaces) {
  return JSON.stringify({
    saved: { home: data.saved.home?.name, work: data.saved.work?.name },
    recent: data.recent.map((p) => p.name),
  });
}

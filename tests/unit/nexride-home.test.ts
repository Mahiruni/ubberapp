import { describe, expect, it } from "vitest";
import {
  emptyHomePlaces,
  restoreHomePlaces,
  serializeHomePlaces,
} from "../../lib/nexride-home";
import { validLocation } from "../../lib/nexride-location";
describe("rider home data", () => {
  it("does not seed a new user's history or addresses", () => {
    expect(restoreHomePlaces(null)).toEqual(emptyHomePlaces());
    expect(restoreHomePlaces("bad json")).toEqual(emptyHomePlaces());
  });
  it("restores only valid preview places and deduplicates history", () => {
    const data = restoreHomePlaces(
      JSON.stringify({
        saved: { home: "Bole Airport", work: "Unknown" },
        recent: ["Meskel Square", "Unknown", "Meskel Square"],
      }),
    );
    expect(data.saved.home?.address).toBe("Bole International Airport");
    expect(data.saved.work).toBeUndefined();
    expect(data.recent.map((p) => p.name)).toEqual(["Meskel Square"]);
    expect(restoreHomePlaces(serializeHomePlaces(data))).toEqual(data);
  });
  it("rejects invalid geographic fixes instead of rendering a false position", () => {
    expect(validLocation({ latitude: 9, longitude: 38, accuracy: 12 })).toBe(
      true,
    );
    expect(validLocation({ latitude: 91, longitude: 38, accuracy: 12 })).toBe(
      false,
    );
    expect(
      validLocation({ latitude: 9, longitude: Infinity, accuracy: 12 }),
    ).toBe(false);
    expect(validLocation({ latitude: 9, longitude: 38, accuracy: -1 })).toBe(
      false,
    );
  });
});

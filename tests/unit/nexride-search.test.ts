import { afterEach, describe, expect, it, vi } from "vitest";
import {
  searchPreviewPlaces,
  locality,
  placeKey,
  serviceBounds,
} from "../../lib/nexride-search";
import { POST } from "../../app/api/rider/route/route";
import { GET } from "../../app/api/rider/search/route";
const pickup = { lat: 9.008, lng: 38.775 },
  destination = { lat: 8.978, lng: 38.799 };
const request = (p = pickup, d = destination) =>
  new Request("http://localhost/api/rider/route", {
    method: "POST",
    body: JSON.stringify({ pickup: p, destination: d }),
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("destination and provider boundaries", () => {
  it("matches English and Amharic and keeps distinct same-name places", () => {
    expect(searchPreviewPlaces("መስቀል")[0].name).toBe("Meskel Square");
    expect(searchPreviewPlaces("meskel")[0].name).toBe("Meskel Square");
    const kolfe = searchPreviewPlaces("Kolfe").filter(
      (p) => p.name === "Kolfe",
    );
    expect(kolfe).toHaveLength(2);
    expect(placeKey(kolfe[0])).not.toBe(placeKey(kolfe[1]));
    expect(locality(kolfe[0], "en")).not.toBe(locality(kolfe[1], "en"));
  });
  it("labels default coverage as preview and validates configured bounds", () => {
    expect(serviceBounds()).toHaveProperty("kind", "preview");
    expect(serviceBounds("38,8,39,10")).toHaveProperty("kind", "configured");
    expect(serviceBounds("39,10,38,8")).toHaveProperty("kind", "preview");
  });
  it("returns no invented route or estimate without a provider", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");
    const response = await POST(request());
    const data = await response.json();
    expect(response.status).toBe(503);
    expect(data.status).toBe("unavailable");
    expect(data.route).toBeUndefined();
  });
  it("rejects missing endpoints, same locations and outside coverage", async () => {
    expect(
      (
        await POST(
          new Request("http://localhost", { method: "POST", body: "{}" }),
        )
      ).status,
    ).toBe(400);
    expect((await (await POST(request(pickup, pickup))).json()).status).toBe(
      "same",
    );
    expect(
      (await (await POST(request({ lat: 0, lng: 0 }, destination))).json())
        .status,
    ).toBe("coverage");
  });
  it("uses validated provider geometry, distance and time", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-token");
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        routes: [
          {
            distance: 4200,
            duration: 960,
            geometry: {
              coordinates: [
                [38.775, 9.008],
                [38.79, 8.99],
                [38.799, 8.978],
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const data = await (await POST(request())).json();
    expect(data.status).toBe("ready");
    expect(data.route.geometry[0]).toEqual([9.008, 38.775]);
    expect(data.route.durationSeconds).toBe(960);
    expect(fetch.mock.calls[0][0]).toContain("directions/v5/mapbox/driving/");
  });
  it("never presents malformed or failed provider responses as a route", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          routes: [
            {
              distance: NaN,
              duration: 600,
              geometry: {
                coordinates: [
                  [38, 9],
                  [38.1, 9.1],
                ],
              },
            },
          ],
        }),
      ),
    );
    expect((await (await POST(request())).json()).status).toBe("error");
  });
  it("keeps low confidence geocoding unconfirmed and uses no-store requests", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-token");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          features: [
            {
              geometry: { coordinates: [38.77, 9.01] },
              properties: {
                name: "Main Road",
                full_address: "Main Road, Bole, Addis Ababa",
                match_code: { confidence: "low" },
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const data = await (
      await GET(new Request("http://localhost/api/rider/search?q=Main%20Road"))
    ).json();
    expect(data.results[0].confirmed).toBe(false);
    expect(fetch.mock.calls[0][1].cache).toBe("no-store");
  });
});

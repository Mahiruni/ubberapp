import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("Biloo ride motion is wired into the Rider and Driver maps", () => {
  const riderMap = read("components/nexride/rider-map.tsx");
  const driverMap = read("components/nexride/driver-navigation-map.tsx");
  const avatarClient = read("lib/biloo-driver-map-avatar-client.ts");
  const css = read("components/nexride/biloo-ride-motion.css");

  it("Rider map drives the approaching car with SmoothCar, one glide per real fix", () => {
    expect(riderMap).toContain('import { SmoothCar } from "../../lib/biloo-smooth-car"');
    expect(riderMap).toContain("new SmoothCar(currentMap, marker)");
    expect(riderMap).toContain("existing.fixKey !== fixKey");
    // The old fixed 720 ms ease-out per update made the car lurch and stop.
    expect(riderMap).not.toContain("const duration = 720");
  });

  it("Rider map keeps the car and pickup framed as the driver closes in", () => {
    expect(riderMap).toContain("approachStep");
    expect(riderMap).toContain("distanceMeters(");
  });

  it("Driver map keeps ONE car marker instead of rebuilding it on every GPS fix", () => {
    expect(driverMap).toContain("new SmoothCar(current, marker)");
    expect(driverMap).toContain("lastVehicleKey.current === key");
    expect(driverMap).not.toContain('addMarker(vehicle, "vehicle"');
    // pickup/destination markers no longer depend on the live GPS position.
    expect(driverMap).toContain("}, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, target, mountedRevision, !!riderAvatar]);");
  });

  it("Driver follow camera travels with the car instead of re-easing per fix", () => {
    expect(driverMap).toContain("easing: (t: number) => t");
    expect(driverMap).toContain("followKey.current === key");
  });

  it("a gliding car's heading is not overwritten with the raw GPS heading", () => {
    expect(avatarClient).toContain("element.dataset.smoothHeading === 'true'");
  });

  it("motion styles respect reduced motion and replace the old turn transition", () => {
    expect(css).toContain("is-gliding");
    expect(css).toContain("transition: none");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("biloo-radar-ripple");
    expect(css).toContain("biloo-car-eta");
  });
});

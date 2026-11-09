import { describe, expect, it } from "vitest";
import {
  Glider, angleDelta, bearingDegrees, distanceMeters, lerpAngle, normalizeDegrees,
} from "../../lib/biloo-motion";

const ADDIS = { lng: 38.7578, lat: 9.0108 };
// ~111 m north of ADDIS (0.001° of latitude).
const NORTH_111M = { lng: ADDIS.lng, lat: ADDIS.lat + 0.001 };

describe("Biloo car heading maths", () => {
  it("normalises angles into [0, 360)", () => {
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(360)).toBe(0);
  });

  it("always turns the short way round", () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 180)).toBe(180);
    expect(lerpAngle(350, 10, 0.5)).toBe(0);
    expect(lerpAngle(10, 350, 0.5)).toBe(0);
  });

  it("computes distance and bearing between fixes", () => {
    expect(distanceMeters(ADDIS, NORTH_111M)).toBeGreaterThan(105);
    expect(distanceMeters(ADDIS, NORTH_111M)).toBeLessThan(118);
    expect(bearingDegrees(ADDIS, NORTH_111M)).toBeCloseTo(0, 1);
    expect(bearingDegrees(NORTH_111M, ADDIS)).toBeCloseTo(180, 1);
    expect(bearingDegrees(ADDIS, { lng: ADDIS.lng + 0.001, lat: ADDIS.lat })).toBeCloseTo(90, 1);
  });
});

describe("Biloo gliding car", () => {
  it("starts at the first fix and does not move without a new fix", () => {
    const glider = new Glider(ADDIS, 0);
    const frame = glider.step(5000);
    expect(frame.lng).toBe(ADDIS.lng);
    expect(frame.lat).toBe(ADDIS.lat);
    expect(frame.active).toBe(false);
  });

  it("glides at steady speed to a new fix instead of jumping", () => {
    const glider = new Glider(ADDIS, 0);
    glider.push(NORTH_111M, 0);                       // first glide: 2200 ms
    const half = glider.step(glider.glideDurationMs / 2);
    expect(half.lat).toBeCloseTo(ADDIS.lat + 0.0005, 6);
    expect(half.active).toBe(true);
    const done = glider.step(glider.glideDurationMs + 10);
    expect(done.lat).toBeCloseTo(NORTH_111M.lat, 9);
  });

  it("sizes each glide to the time since the previous fix", () => {
    const glider = new Glider(ADDIS, 0);
    glider.push({ lng: ADDIS.lng, lat: ADDIS.lat + 0.0002 }, 0);
    glider.step(2300);
    glider.push({ lng: ADDIS.lng, lat: ADDIS.lat + 0.0004 }, 4000);
    expect(glider.glideDurationMs).toBe(4000);
    glider.step(4100);
    glider.push({ lng: ADDIS.lng, lat: ADDIS.lat + 0.0006 }, 4200);
    expect(glider.glideDurationMs).toBe(900);          // clamped minimum
    glider.step(4300);
    glider.push({ lng: ADDIS.lng, lat: ADDIS.lat + 0.0008 }, 30_000);
    expect(glider.glideDurationMs).toBe(6000);         // clamped maximum
  });

  it("restarts from where the car is now when a fix arrives mid-glide", () => {
    const glider = new Glider(ADDIS, 0);
    glider.push(NORTH_111M, 0);
    const mid = glider.step(1100);
    glider.push({ lng: ADDIS.lng, lat: ADDIS.lat + 0.002 }, 1100);
    const next = glider.step(1101);
    expect(Math.abs(next.lat - mid.lat)).toBeLessThan(0.0001); // no jump
  });

  it("turns the car towards the direction it actually travels", () => {
    const glider = new Glider(ADDIS, 0);
    glider.push({ lng: ADDIS.lng + 0.001, lat: ADDIS.lat }, 0);   // due east
    expect(glider.headingTarget).toBeCloseTo(90, 1);
    let frame = glider.step(0);
    for (let t = 16; t <= 1500; t += 16) frame = glider.step(t);
    expect(frame.heading).toBeGreaterThan(85);
    expect(frame.heading).toBeLessThanOrEqual(90.01);
  });

  it("takes the short way across north (350° to 10°)", () => {
    const glider = new Glider({ ...ADDIS, heading: 350 }, 0);
    // Drive slightly east of north: bearing is a few degrees past 0.
    glider.push({ lng: ADDIS.lng + 0.00006, lat: ADDIS.lat + 0.001 }, 0);
    let previous = glider.step(0).heading;
    for (let t = 16; t <= 1500; t += 16) {
      const next = glider.step(t).heading;
      // Never swings through the long way (south).
      expect(Math.abs(angleDelta(previous, next))).toBeLessThan(15);
      previous = next;
    }
  });

  it("keeps heading when the car barely moves (GPS noise)", () => {
    const glider = new Glider({ ...ADDIS, heading: 120 }, 0);
    glider.push({ lng: ADDIS.lng + 0.00001, lat: ADDIS.lat }, 1000); // ~1 m
    expect(glider.headingTarget).toBe(120);
  });

  it("uses a reported heading only when there is no real movement", () => {
    const glider = new Glider(ADDIS, 0);
    glider.push({ lng: ADDIS.lng, lat: ADDIS.lat, heading: 200 }, 1000);
    expect(glider.headingTarget).toBe(200);
  });

  it("snaps instead of racing across the map after a long gap", () => {
    const glider = new Glider(ADDIS, 0);
    glider.push({ lng: ADDIS.lng, lat: ADDIS.lat + 0.02 }, 1000); // ~2.2 km
    const frame = glider.step(1001);
    expect(frame.lat).toBeCloseTo(ADDIS.lat + 0.02, 9);
    expect(frame.active).toBe(false);
  });

  it("does not animate with reduced motion", () => {
    const glider = new Glider(ADDIS, 0, { reducedMotion: true });
    glider.push(NORTH_111M, 100);
    const frame = glider.step(101);
    expect(frame.lat).toBe(NORTH_111M.lat);
    expect(frame.active).toBe(false);
  });

  it("ignores invalid fixes", () => {
    const glider = new Glider(ADDIS, 0);
    glider.push({ lng: Number.NaN, lat: 1 }, 100);
    glider.push({ lng: 0, lat: 200 }, 100);
    expect(glider.step(200).lat).toBe(ADDIS.lat);
  });
});

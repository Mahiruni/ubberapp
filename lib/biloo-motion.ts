/**
 * Smooth vehicle motion for Biloo maps (inDrive-style gliding car).
 *
 * GPS fixes arrive every few seconds. Drawing the car only when a fix arrives
 * makes it jump and spin. A Glider keeps one continuously moving "display"
 * position: each new fix becomes the next target and the car travels to it at
 * constant speed over roughly the time the fix took to arrive, so the next fix
 * lands as the car reaches the previous one. Heading is derived from the
 * actual movement (GPS compass is unreliable at low speed) and always turns
 * the SHORT way round (350° → 10° is a 20° turn, not 340°).
 *
 * Pure functions + one small class: no DOM, no map library, easy to test.
 * It never invents positions: the car never moves past the latest real fix.
 */

export type GlideFix = {
  lng: number;
  lat: number;
  /** Compass heading in degrees (0 = north), if the device reported one. */
  heading?: number | null;
};

export type GlideOptions = {
  /** Shortest / longest time a glide may take (ms). */
  minDurationMs?: number;
  maxDurationMs?: number;
  /** Duration used for the very first glide after a snap (ms). */
  firstDurationMs?: number;
  /** A fix farther than this from the car snaps instead of gliding (metres). */
  snapDistanceMeters?: number;
  /** Movement shorter than this is GPS noise: position moves, heading holds. */
  minTurnMeters?: number;
  /** Time constant of the car's visual turn (ms). Smaller = snappier. */
  headingTauMs?: number;
  /** Time constant of the (slower) camera bearing (ms). */
  cameraTauMs?: number;
  /** When true there is no animation at all (prefers-reduced-motion). */
  reducedMotion?: boolean;
};

export type GlideFrame = {
  lng: number;
  lat: number;
  /** Heading of the car, degrees in [0, 360). */
  heading: number;
  /** Slower heading, for rotating a follow camera without nausea. */
  cameraHeading: number;
  /** True while the car still has distance or turning left to cover. */
  active: boolean;
};

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const validFix = (fix: unknown): fix is GlideFix => {
  const f = fix as GlideFix | null;
  return !!f && Number.isFinite(f.lng) && Number.isFinite(f.lat)
    && Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180;
};

/** Normalise any angle to [0, 360). */
export const normalizeDegrees = (angle: number) => ((angle % 360) + 360) % 360;

/** Signed shortest rotation from `from` to `to`, in (-180, 180]. */
export function angleDelta(from: number, to: number) {
  const delta = normalizeDegrees(to - from);
  return delta > 180 ? delta - 360 : delta;
}

/** Move `from` towards `to` along the short way; t in [0, 1]. */
export const lerpAngle = (from: number, to: number, t: number) =>
  normalizeDegrees(from + angleDelta(from, to) * clamp(t, 0, 1));

/** Great-circle distance between two fixes, in metres. */
export function distanceMeters(a: GlideFix, b: GlideFix) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from `a` to `b`, degrees in [0, 360). */
export function bearingDegrees(a: GlideFix, b: GlideFix) {
  const phi1 = toRad(a.lat), phi2 = toRad(b.lat), dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

const DEFAULTS = {
  minDurationMs: 900,
  maxDurationMs: 6000,
  firstDurationMs: 2200,
  snapDistanceMeters: 800,
  minTurnMeters: 5,
  headingTauMs: 260,
  cameraTauMs: 750,
  reducedMotion: false,
} satisfies Required<GlideOptions>;

const validHeading = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 360;

export class Glider {
  private opts: Required<GlideOptions>;
  private lng: number;
  private lat: number;
  private fromLng: number;
  private fromLat: number;
  private toLng: number;
  private toLat: number;
  private startedAt: number;
  private duration: number;
  private lastPushAt: number;
  private lastStepAt: number;
  private heading: number;
  private cameraHeading: number;
  private targetHeading: number;
  private pushes = 0;

  constructor(initial: GlideFix, now: number, options: GlideOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.lng = this.fromLng = this.toLng = initial.lng;
    this.lat = this.fromLat = this.toLat = initial.lat;
    this.startedAt = this.lastPushAt = this.lastStepAt = now;
    this.duration = 1;
    this.heading = this.cameraHeading = this.targetHeading =
      validHeading(initial.heading) ? normalizeDegrees(initial.heading) : 0;
  }

  setOptions(options: GlideOptions) { this.opts = { ...this.opts, ...options }; }

  /** The heading the car is turning towards (for follow cameras). */
  get headingTarget() { return this.targetHeading; }

  /** How long the current glide takes in total (for syncing a camera). */
  get glideDurationMs() { return this.duration; }

  get position(): GlideFix { return { lng: this.lng, lat: this.lat, heading: this.heading }; }

  /** Teleport: no animation, heading kept (or taken from the fix). */
  snap(fix: GlideFix, now: number) {
    this.lng = this.fromLng = this.toLng = fix.lng;
    this.lat = this.fromLat = this.toLat = fix.lat;
    this.startedAt = this.lastPushAt = this.lastStepAt = now;
    this.duration = 1;
    if (validHeading(fix.heading)) {
      this.heading = this.cameraHeading = this.targetHeading = normalizeDegrees(fix.heading);
    }
  }

  /** Register a new real GPS fix; the car glides there from where it is now. */
  push(fix: GlideFix, now: number) {
    if (!validFix(fix)) return;
    const here: GlideFix = { lng: this.lng, lat: this.lat };
    const away = distanceMeters(here, fix);

    if (this.opts.reducedMotion || away > this.opts.snapDistanceMeters) {
      this.snap(fix, now);
      this.pushes += 1;
      return;
    }

    const interval = this.pushes === 0 ? this.opts.firstDurationMs : now - this.lastPushAt;
    this.duration = clamp(interval, this.opts.minDurationMs, this.opts.maxDurationMs);
    this.fromLng = this.lng; this.fromLat = this.lat;
    this.toLng = fix.lng; this.toLat = fix.lat;
    this.startedAt = now;
    this.lastPushAt = now;
    this.lastStepAt = Math.max(this.lastStepAt, now - 16);
    this.pushes += 1;

    // Heading: real movement beats GPS compass; compass is used when the car
    // has barely moved but the device still reports a heading.
    if (away >= this.opts.minTurnMeters) this.targetHeading = bearingDegrees(here, fix);
    else if (validHeading(fix.heading)) this.targetHeading = normalizeDegrees(fix.heading);
  }

  /** Advance to time `now` and return where to draw the car. */
  step(now: number): GlideFrame {
    const progress = clamp((now - this.startedAt) / this.duration, 0, 1);
    this.lng = this.fromLng + (this.toLng - this.fromLng) * progress;
    this.lat = this.fromLat + (this.toLat - this.fromLat) * progress;

    const dt = clamp(now - this.lastStepAt, 0, 500);
    this.lastStepAt = now;
    if (this.opts.reducedMotion) {
      this.heading = this.cameraHeading = this.targetHeading;
    } else {
      this.heading = lerpAngle(this.heading, this.targetHeading, 1 - Math.exp(-dt / this.opts.headingTauMs));
      this.cameraHeading = lerpAngle(this.cameraHeading, this.targetHeading, 1 - Math.exp(-dt / this.opts.cameraTauMs));
    }

    const turning = Math.abs(angleDelta(this.heading, this.targetHeading)) > 0.4
      || Math.abs(angleDelta(this.cameraHeading, this.targetHeading)) > 0.4;
    return {
      lng: this.lng, lat: this.lat,
      heading: this.heading, cameraHeading: this.cameraHeading,
      active: progress < 1 || turning,
    };
  }
}

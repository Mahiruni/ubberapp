'use client';

import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { Glider, validFix, type GlideFix, type GlideFrame } from './biloo-motion';

/**
 * Drives one Mapbox car marker the way ride-hailing apps do: the car glides
 * continuously between real GPS fixes, turns smoothly (never the long way
 * round) and keeps its roof pointing along the road, even while the map
 * itself is rotated. The render loop only runs while the car is moving or
 * turning, so a parked car costs nothing.
 *
 * The marker element must come from `driverCarMarkerElement` (it owns the
 * `.biloo-driver-car-art` image that this class rotates).
 */
export class SmoothCar {
  readonly marker: MapboxMarker;
  private readonly map: MapboxMap;
  private readonly element: HTMLElement;
  private readonly onFrame?: (frame: GlideFrame, car: SmoothCar) => void;
  private glider: Glider | null = null;
  private raf = 0;
  private heading = 0;
  private destroyed = false;
  private enterTimer = 0;

  constructor(map: MapboxMap, marker: MapboxMarker, onFrame?: (frame: GlideFrame, car: SmoothCar) => void) {
    this.map = map;
    this.marker = marker;
    this.element = marker.getElement();
    this.onFrame = onFrame;
    // updateDriverCarMarker() must not overwrite the heading we animate.
    this.element.dataset.smoothHeading = 'true';
    this.element.classList.add('is-gliding');
    map.on('rotate', this.onRotate);
  }

  /** Total time the current glide takes, for syncing a follow camera. */
  get glideDurationMs() { return this.glider?.glideDurationMs ?? 0; }

  /** Heading the car is turning towards, degrees. */
  get headingTarget() { return this.glider?.headingTarget ?? this.heading; }

  /** Register a new real GPS fix. The first one places the car without gliding. */
  push(fix: GlideFix) {
    if (this.destroyed || !validFix(fix)) return;
    const now = performance.now();
    const reducedMotion = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!this.glider) {
      this.glider = new Glider(fix, now, { reducedMotion });
      this.marker.setLngLat([fix.lng, fix.lat]);
      this.applyHeading(this.glider.step(now).heading);
      this.playEntrance();
      return;
    }
    this.glider.setOptions({ reducedMotion });
    this.glider.push(fix, now);
    this.start();
  }

  /** Small ETA bubble above the car (null hides it). */
  setLabel(text: string | null) {
    let label = this.element.querySelector<HTMLElement>('.biloo-car-eta');
    if (!text) { label?.remove(); return; }
    if (!label) {
      label = document.createElement('span');
      label.className = 'biloo-car-eta';
      label.setAttribute('aria-hidden', 'true');
      this.element.append(label);
    }
    if (label.textContent !== text) label.textContent = text;
  }

  setStale(stale: boolean) {
    this.element.classList.toggle('is-stale', stale);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.enterTimer);
    this.map.off('rotate', this.onRotate);
    this.marker.remove();
  }

  private start() {
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.raf = 0;
    const glider = this.glider;
    if (!glider || this.destroyed) return;
    const frame = glider.step(now);
    this.marker.setLngLat([frame.lng, frame.lat]);
    this.applyHeading(frame.heading);
    this.onFrame?.(frame, this);
    if (frame.active) this.raf = requestAnimationFrame(this.tick);
  };

  private readonly onRotate = () => this.applyHeading(this.heading);

  /** Rotate only the car art; the marker root stays on the GPS point. */
  private applyHeading(heading: number) {
    this.heading = heading;
    const art = this.element.querySelector<HTMLElement>('.biloo-driver-car-art');
    // Number(...) drops trailing zeros so a steady heading reads "65deg", not "65.00deg".
    if (art) art.style.setProperty('--biloo-car-heading', `${Number((heading - this.map.getBearing()).toFixed(2))}deg`);
  }

  private playEntrance() {
    this.element.classList.add('is-entering');
    window.clearTimeout(this.enterTimer);
    this.enterTimer = window.setTimeout(() => this.element.classList.remove('is-entering'), 700);
  }
}

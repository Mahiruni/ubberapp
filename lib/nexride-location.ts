"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RiderLocation = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  heading: number | null;
};

export type LocationStatus =
  "idle" | "loading" | "ready" | "denied" | "unavailable";

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 5000,
};

export function validLocation(
  coords: Pick<GeolocationCoordinates, "latitude" | "longitude" | "accuracy">,
) {
  return (
    Number.isFinite(coords.latitude) &&
    Math.abs(coords.latitude) <= 90 &&
    Number.isFinite(coords.longitude) &&
    Math.abs(coords.longitude) <= 180 &&
    Number.isFinite(coords.accuracy) &&
    coords.accuracy >= 0
  );
}

export function useRiderLocation() {
  const [position, setPosition] = useState<RiderLocation | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [recenter, setRecenter] = useState(0);

  const active = useRef(true);
  const watchId = useRef<number | null>(null);
  const latest = useRef<RiderLocation | null>(null);

  const clearWatch = useCallback(() => {
    if (watchId.current === null || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const startWatch = useCallback(
    (recenterOnFirstFix = false) => {
      if (!navigator.geolocation || !window.isSecureContext) {
        clearWatch();
        latest.current = null;
        setPosition(null);
        setStatus("unavailable");
        return;
      }

      if (watchId.current !== null) {
        if (recenterOnFirstFix && latest.current) {
          setRecenter((value) => value + 1);
        }
        return;
      }

      if (!latest.current) setStatus("loading");
      let shouldRecenter = recenterOnFirstFix;

      try {
        watchId.current = navigator.geolocation.watchPosition(
          (result) => {
            if (!active.current || !validLocation(result.coords)) return;

            const next: RiderLocation = {
              lat: result.coords.latitude,
              lng: result.coords.longitude,
              accuracy: result.coords.accuracy,
              timestamp: result.timestamp || Date.now(),
              heading:
                typeof result.coords.heading === "number" &&
                Number.isFinite(result.coords.heading)
                  ? result.coords.heading
                  : null,
            };

            latest.current = next;
            setPosition(next);
            setStatus("ready");

            if (shouldRecenter) {
              shouldRecenter = false;
              setRecenter((value) => value + 1);
            }
          },
          (error) => {
            if (!active.current) return;

            if (error.code === error.PERMISSION_DENIED) {
              clearWatch();
              latest.current = null;
              setPosition(null);
              setStatus("denied");
              return;
            }

            // Keep the last confirmed fix on transient GPS failures. RiderMap
            // marks it stale after 15 seconds instead of inventing a position.
            if (!latest.current) setStatus("unavailable");
          },
          GEO_OPTIONS,
        );
      } catch {
        if (!latest.current) setStatus("unavailable");
      }
    },
    [clearWatch],
  );

  const locate = useCallback(() => {
    if (latest.current) {
      setRecenter((value) => value + 1);
      startWatch(false);
      return;
    }
    startWatch(true);
  }, [startWatch]);

  useEffect(() => {
    active.current = true;
    let permission: PermissionStatus | null = null;
    let cancelled = false;

    // Auto-acquire foreground GPS only while the map is visible. Android and
    // browsers may pause or recreate the page when the screen is locked.
    // Never run a permanent GPS watcher from a background Rider/Driver PWA.
    if (document.visibilityState !== "hidden") startWatch(false);

    const syncPermission = () => {
      if (cancelled || !active.current || !permission) return;

      if (permission.state === "denied") {
        clearWatch();
        latest.current = null;
        setPosition(null);
        setStatus("denied");
      } else if (permission.state === "granted" && document.visibilityState !== "hidden") {
        startWatch(false);
      } else if (!latest.current && watchId.current === null) {
        // Browsers may report "prompt" until the user answers. Keep loading
        // while a GPS watch is active instead of reporting a false idle state.
        setStatus("loading");
      }
    };

    const pauseLocation = () => {
      if (cancelled) return;
      clearWatch();
      // Keep last confirmed coordinates for a stale/paused indicator; do not
      // fabricate fresh GPS points while the application is backgrounded.
    };

    const resumeLocation = () => {
      if (cancelled || !active.current || document.visibilityState === "hidden") return;
      if (permission?.state === "denied") {
        syncPermission(); // Never silently re-prompt after permission denial.
        return;
      }
      startWatch(false);
    };

    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") pauseLocation();
      else resumeLocation();
    };

    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", pauseLocation);
    window.addEventListener("pageshow", resumeLocation);

    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        if (cancelled || !active.current) return;
        permission = result;
        syncPermission();
        result.addEventListener("change", syncPermission);
      })
      .catch(() => {
        // Location acquisition was started above. This API is optional; Safari
        // and Android WebViews can still resolve their GPS permission prompt.
      });

    return () => {
      cancelled = true;
      active.current = false;
      clearWatch();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", pauseLocation);
      window.removeEventListener("pageshow", resumeLocation);
      permission?.removeEventListener("change", syncPermission);
    };
  }, [clearWatch, startWatch]);

  return { position, status, locate, recenter };
}

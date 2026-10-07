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

    const syncPermission = () => {
      if (cancelled || !active.current || !permission) return;

      if (permission.state === "denied") {
        clearWatch();
        latest.current = null;
        setPosition(null);
        setStatus("denied");
      } else if (permission.state === "granted") {
        startWatch(false);
      } else if (!latest.current) {
        setStatus("idle");
      }
    };

    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        if (cancelled || !active.current) return;
        permission = result;
        syncPermission();
        result.addEventListener("change", syncPermission);
      })
      .catch(() => {
        // Browsers without Permissions API support still start location
        // tracking when the user taps the locate control.
      });

    return () => {
      cancelled = true;
      active.current = false;
      clearWatch();
      permission?.removeEventListener("change", syncPermission);
    };
  }, [clearWatch, startWatch]);

  return { position, status, locate, recenter };
}

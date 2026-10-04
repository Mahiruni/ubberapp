"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export type RiderLocation = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};
export type LocationStatus =
  "idle" | "loading" | "ready" | "denied" | "unavailable";
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
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locate = useCallback(() => {
    if (!navigator.geolocation || !window.isSecureContext) {
      setPosition(null);
      setStatus("unavailable");
      return;
    }
    const id = ++request.current;
    if (timer.current) clearTimeout(timer.current);
    setStatus("loading");
    setPosition(null);
    const fail = (denied = false) => {
      if (!active.current || id !== request.current) return;
      request.current++;
      if (timer.current) clearTimeout(timer.current);
      setStatus(denied ? "denied" : "unavailable");
    };
    timer.current = setTimeout(() => fail(), 11000);
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (!active.current || id !== request.current) return;
          if (!validLocation(p.coords)) {
            fail();
            return;
          }
          if (timer.current) clearTimeout(timer.current);
          setPosition({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
            timestamp: p.timestamp,
          });
          setStatus("ready");
          setRecenter((v) => v + 1);
        },
        (error) => fail(error.code === 1),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    } catch {
      fail();
    }
  }, []);
  useEffect(() => {
    active.current = true;
    let permission: PermissionStatus | null = null;
    let cancelled = false;
    const change = () => {
      if (cancelled || !active.current || !permission) return;
      if (permission.state === "denied") {
        request.current++;
        if (timer.current) clearTimeout(timer.current);
        setPosition(null);
        setStatus("denied");
      } else if (permission.state === "granted") locate();
      else {
        setPosition(null);
        setStatus("idle");
      }
    };
    // Ask only on an explicit action, unless permission was already granted.
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        if (cancelled || !active.current) return;
        permission = result;
        change();
        result.addEventListener("change", change);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      active.current = false;
      request.current++;
      if (timer.current) clearTimeout(timer.current);
      permission?.removeEventListener("change", change);
    };
  }, [locate]);
  return { position, status, locate, recenter };
}

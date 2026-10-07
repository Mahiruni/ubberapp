"use client";
import { useEffect, useRef, useState } from "react";
import {
  endpointKey,
  previewEndpoint,
  validPoint,
  type Endpoint,
} from "./nexride-search";
import type { Place } from "./nexride-places";
import type { RiderLocation } from "./nexride-location";
import type { Language } from "./nexride-i18n";
import type { RouteResult } from "./location";
const JOURNEY_STORAGE_KEY = "nexride.rider.journey.v1";
const endpointSources = new Set(["preview", "provider", "device", "pin"]);
function restoreEndpoint(value: unknown): Endpoint | null {
  const point = value as Record<string, unknown> | null;
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  const source = String(point?.source || "");
  if (
    !point ||
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(lng) ||
    Math.abs(lng) > 180 ||
    !endpointSources.has(source) ||
    typeof point.confirmed !== "boolean"
  )
    return null;
  const accuracy = Number(point.accuracy);
  return {
    lat,
    lng,
    name: typeof point.name === "string" ? point.name.slice(0, 180) : "",
    address:
      typeof point.address === "string" ? point.address.slice(0, 320) : "",
    source: source as Endpoint["source"],
    confirmed: point.confirmed,
    ...(Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}),
  };
}
export type RouteState = {
  key: string;
  status:
    | "idle"
    | "loading"
    | "ready"
    | "unavailable"
    | "error"
    | "coverage"
    | "same";
  route?: RouteResult;
  alternatives?: RouteResult[];
  selectedIndex?: number;
  updatedAt?: number;
  coverage?: { kind: "preview" | "configured" };
};
export function useJourney(position: RiderLocation | null, language: Language = "en") {
  const [pickup, setPickup] = useState<Endpoint | null>(null);
  const [destination, setDestination] = useState<Endpoint | null>(null);
  const [pinMode, setPinMode] = useState<"pickup" | "destination" | null>(null);
  const [result, setResult] = useState<RouteState>({ key: "", status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sheetRatio, setSheetRatio] = useState(0.46);
  const [viewport, setViewport] = useState({ height: 0, keyboard: false });
  const nextDevice = useRef(false);
  const [storageReady, setStorageReady] = useState(false);
  const reverseCache = useRef(new Map<string, { name: string; address: string }>());
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(JOURNEY_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          pickup?: unknown;
          destination?: unknown;
        };
        const restoredPickup = restoreEndpoint(saved.pickup);
        const restoredDestination = restoreEndpoint(saved.destination);
        if (restoredPickup) setPickup(restoredPickup);
        if (restoredDestination) setDestination(restoredDestination);
      }
    } catch {}
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    try {
      sessionStorage.setItem(
        JOURNEY_STORAGE_KEY,
        JSON.stringify({ pickup, destination }),
      );
    } catch {}
  }, [pickup, destination, storageReady]);
  const key = endpointKey(pickup, destination);
  const valid =
    !!pickup?.confirmed &&
    !!destination?.confirmed &&
    validPoint(pickup) &&
    validPoint(destination);
  const routeState: RouteState =
    !dragging && result.key === key
      ? result
      : { key, status: valid ? "loading" : "idle" };
  const select = (field: "pickup" | "destination", point: Endpoint) => {
    if (!validPoint(point)) return;
    if (field === "pickup") {
      nextDevice.current = false;
      setPickup(point);
    } else setDestination(point);
    setPinMode(null);
  };
  const setPin = (
    field: "pickup" | "destination",
    coords: { lat: number; lng: number },
  ) => {
    if (!validPoint(coords)) return;
    setDragging(false);
    const point: Endpoint = {
      ...coords,
      source: "pin",
      confirmed: false,
      name: "",
      address: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
    };
    const setter = field === "pickup" ? setPickup : setDestination;
    if (field === "pickup") nextDevice.current = false;
    setter(point);
    const params = new URLSearchParams({
      mode: "reverse",
      lat: String(coords.lat),
      lng: String(coords.lng),
      lang: language,
    });
    fetch(`/api/rider/search?${params}`, {
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        const result = data?.results?.[0] as Endpoint | undefined;
        if (!result || !validPoint(result)) return;
        const name =
          typeof result.name === "string" && result.name.trim()
            ? result.name.trim()
            : typeof result.address === "string"
              ? result.address.trim()
              : "";
        const address =
          typeof result.address === "string" && result.address.trim()
            ? result.address.trim()
            : point.address;
        if (!name && !address) return;
        setter((current) =>
          current?.source === "pin" &&
          current.lat === coords.lat &&
          current.lng === coords.lng
            ? { ...current, name: name || address, address }
            : current,
        );
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (!storageReady || !position) return;
    if (nextDevice.current || !pickup) {
      nextDevice.current = false;
      setPickup({
        ...position,
        source: "device",
        confirmed: position.accuracy <= 100,
        name: "",
        address: `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`,
      });
    }
    // Device updates do not override a manually selected pickup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, storageReady]);
  useEffect(() => {
    if (!position || pickup?.source !== "device" || pickup.name) return;
    const cacheKey = pickup.lat.toFixed(4) + "," + pickup.lng.toFixed(4);
    const cached = reverseCache.current.get(cacheKey);
    if (cached) {
      setPickup((current) =>
        current?.source === "device" ? { ...current, ...cached } : current,
      );
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        mode: "reverse",
        lat: String(pickup.lat),
        lng: String(pickup.lng),
        lang: language,
      });
      fetch("/api/rider/search?" + params, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(9000)]),
        cache: "no-store",
      })
        .then((response) => response.json())
        .then((data) => {
          const result = data?.results?.[0] as Endpoint | undefined;
          if (!result || !validPoint(result)) return;
          const name =
            typeof result.name === "string" && result.name.trim()
              ? result.name.trim()
              : typeof result.address === "string"
                ? result.address.trim()
                : "";
          const address =
            typeof result.address === "string" && result.address.trim()
              ? result.address.trim()
              : pickup.address;
          if (!name && !address) return;
          const resolved = { name: name || address, address };
          reverseCache.current.set(cacheKey, resolved);
          setPickup((current) =>
            current?.source === "device" &&
            Math.abs(current.lat - pickup.lat) < 0.0002 &&
            Math.abs(current.lng - pickup.lng) < 0.0002
              ? { ...current, ...resolved }
              : current,
          );
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pickup?.address, pickup?.lat, pickup?.lng, pickup?.name, pickup?.source, position, language]);
  useEffect(() => {
    if (!valid || !pickup || !destination) {
      setResult({ key, status: "idle" });
      return;
    }

    let active = true;
    let controller: AbortController | null = null;

    const validRoute = (route: RouteResult | undefined) =>
      !!route &&
      Number.isFinite(route.distanceMeters) &&
      route.distanceMeters >= 0 &&
      Number.isFinite(route.durationSeconds) &&
      route.durationSeconds >= 0 &&
      route.provider === "mapbox" &&
      Array.isArray(route.geometry) &&
      route.geometry.length >= 2 &&
      route.geometry.every((coordinate) =>
        validPoint({ lat: coordinate?.[0], lng: coordinate?.[1] }),
      );

    const load = async (background = false) => {
      controller?.abort();
      controller = new AbortController();
      if (!background)
        setResult((current) =>
          current.key === key && current.status === "ready"
            ? current
            : { key, status: "loading" },
        );

      try {
        const response = await fetch("/api/rider/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup: { lat: pickup.lat, lng: pickup.lng },
            destination: { lat: destination.lat, lng: destination.lng },
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
          cache: "no-store",
        });
        const data = await response.json();
        if (!active) return;

        if (
          !["ready", "unavailable", "error", "coverage", "same"].includes(
            data.status,
          )
        )
          throw new Error("Invalid route response");

        if (data.status !== "ready") {
          setResult({ ...data, key });
          return;
        }

        const alternatives = (
          Array.isArray(data.alternatives)
            ? data.alternatives
            : [data.route]
        ).filter((route: RouteResult | undefined): route is RouteResult =>
          validRoute(route),
        );

        if (!alternatives.length || !validRoute(data.route))
          throw new Error("Invalid route");

        alternatives.sort(
          (a, b) =>
            a.durationSeconds - b.durationSeconds ||
            a.distanceMeters - b.distanceMeters,
        );

        setResult((current) => {
          const previousIndex =
            current.key === key && current.status === "ready"
              ? current.selectedIndex || 0
              : 0;
          const selectedIndex = Math.min(
            previousIndex,
            alternatives.length - 1,
          );
          return {
            ...data,
            key,
            status: "ready",
            alternatives,
            selectedIndex,
            route: alternatives[selectedIndex],
            updatedAt:
              Number.isFinite(Number(data.updatedAt))
                ? Number(data.updatedAt)
                : Date.now(),
          };
        });
      } catch {
        if (!active) return;
        setResult((current) =>
          background && current.key === key && current.status === "ready"
            ? current
            : { key, status: "error" },
        );
      }
    };

    void load(false);
    const timer = window.setInterval(() => {
      void load(true);
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(timer);
      controller?.abort();
    };
    // Only coordinates, confirmation, and explicit retry affect the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid, retry]);

  useEffect(() => {
    const update = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      setViewport({ height, keyboard: height < window.innerHeight - 120 });
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return {
    pickup,
    destination,
    pinMode,
    select,
    setPin,
    routeState,
    valid,
    canContinue:
      !dragging &&
      valid &&
      ["ready", "unavailable"].includes(routeState.status),
    clear: (field: "pickup" | "destination") => {
      (field === "pickup" ? setPickup : setDestination)(null);
      setPinMode(null);
    },
    choosePreview: (p: Place) => select("destination", previewEndpoint(p)),
    requestCurrent: () => {
      nextDevice.current = true;
      setPickup(null);
      setPinMode(null);
    },
    startPin: (field: "pickup" | "destination") => {
      setPinMode(field);
      setSheetRatio(0.28);
    },
    confirm: (field: "pickup" | "destination") => {
      (field === "pickup" ? setPickup : setDestination)(
        (p) => p && { ...p, confirmed: true },
      );
      setPinMode(null);
      setSheetRatio(0.46);
    },
    invalidatePickup: () => setDragging(true),
    retryRoute: () => setRetry((v) => v + 1),
    selectRoute: (index: number) =>
      setResult((current) => {
        if (
          current.status !== "ready" ||
          !current.alternatives?.length ||
          index < 0 ||
          index >= current.alternatives.length
        )
          return current;
        return {
          ...current,
          selectedIndex: index,
          route: current.alternatives[index],
        };
      }),
    sheetRatio,
    setSheetRatio,
    viewport,
  };
}
export type Journey = ReturnType<typeof useJourney>;

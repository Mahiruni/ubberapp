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
import type { RouteResult } from "./location";
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
  coverage?: { kind: "preview" | "configured" };
};
export function useJourney(position: RiderLocation | null) {
  const [pickup, setPickup] = useState<Endpoint | null>(null);
  const [destination, setDestination] = useState<Endpoint | null>(null);
  const [pinMode, setPinMode] = useState<"pickup" | "destination" | null>(null);
  const [result, setResult] = useState<RouteState>({ key: "", status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sheetRatio, setSheetRatio] = useState(0.62);
  const [viewport, setViewport] = useState({ height: 0, keyboard: false });
  const nextDevice = useRef(false);
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
    });
    fetch(`/api/rider/search?${params}`, {
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        const name = data.results?.[0]?.address;
        if (typeof name !== "string") return;
        setter((current) =>
          current?.source === "pin" &&
          current.lat === coords.lat &&
          current.lng === coords.lng
            ? { ...current, name, address: `${name} · ${point.address}` }
            : current,
        );
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (!position) return;
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
  }, [position]);
  useEffect(() => {
    if (!valid || !pickup || !destination) {
      setResult({ key, status: "idle" });
      return;
    }
    let active = true;
    const controller = new AbortController();
    setResult({ key, status: "loading" });
    fetch("/api/rider/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pickup: { lat: pickup.lat, lng: pickup.lng },
        destination: { lat: destination.lat, lng: destination.lng },
      }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (
          !["ready", "unavailable", "error", "coverage", "same"].includes(
            data.status,
          )
        )
          throw new Error("Invalid route response");
        if (
          data.status === "ready" &&
          (!Number.isFinite(data.route?.distanceMeters) ||
            data.route.distanceMeters < 0 ||
            !Number.isFinite(data.route?.durationSeconds) ||
            data.route.durationSeconds < 0 ||
            data.route?.provider !== "mapbox" ||
            !Array.isArray(data.route?.geometry) ||
            data.route.geometry.length < 2 ||
            !data.route.geometry.every((c: number[]) =>
              validPoint({ lat: c?.[0], lng: c?.[1] }),
            ))
        )
          throw new Error("Invalid route");
        setResult({ ...data, key });
      })
      .catch(() => {
        if (active) setResult({ key, status: "error" });
      });
    return () => {
      active = false;
      controller.abort();
    };
    // Only coordinates and confirmation affect the route; reverse labels don't.
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
      setSheetRatio(0.32);
    },
    confirm: (field: "pickup" | "destination") => {
      (field === "pickup" ? setPickup : setDestination)(
        (p) => p && { ...p, confirmed: true },
      );
      setPinMode(null);
      setSheetRatio(0.62);
    },
    invalidatePickup: () => setDragging(true),
    retryRoute: () => setRetry((v) => v + 1),
    sheetRatio,
    setSheetRatio,
    viewport,
  };
}
export type Journey = ReturnType<typeof useJourney>;

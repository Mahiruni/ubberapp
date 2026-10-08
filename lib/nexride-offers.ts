"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  bookingAdapter,
  fareTotal,
  previewFares,
  pricingFingerprint,
  type FareSet,
  type RideCategory,
  type RideFare,
} from "./nexride-booking";
import type { Journey } from "./nexride-journey";
export function useRideOffers(
  journey: Journey,
  onPending: (pending: boolean) => void,
  onCreated: (requestId: string, fare: RideFare) => void,
) {
  const [fares, setFares] = useState<FareSet | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [selected, setSelected] = useState<RideCategory>("economy");
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("nexride.rider.ride-category");
      if (saved === "economy" || saved === "comfort" || saved === "xl") setSelected(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem("nexride.rider.ride-category", selected); } catch {}
  }, [selected]);
  const [requestState, setRequestState] = useState<
    "idle" | "pending" | "failed" | "unavailable" | "unknown" | "accepted"
  >("idle");
  const [requestId, setRequestId] = useState("");
  const [changed, setChanged] = useState<{
    old: number | null;
    next: number | null;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loadError, setLoadError] = useState<"auth" | "journey" | null>(null);
  const lock = useRef(false),
    mounted = useRef(true),
    prior = useRef<FareSet | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const chosen = fares?.offers.find((o) => o.category === selected);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const key =
    journey.pickup && journey.destination
      ? `${journey.pickup.lat},${journey.pickup.lng};${journey.destination.lat},${journey.destination.lng}`
      : "";
  const previousKey = useRef(key);
  const load = useCallback(() => {
    if (!lock.current) setRefresh((v) => v + 1);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onPending(false);
    };
  }, [onPending]);
  useEffect(() => {
    if (previousKey.current !== key) {
      prior.current = null;
      attempt.current = null;
      setChanged(null);
      previousKey.current = key;
    }
    if (!journey.pickup || !journey.destination || !journey.canContinue) return;
    let active = true;
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError(null);
    setRequestState("idle");
    bookingAdapter
      .fares(
        { pickup: journey.pickup, destination: journey.destination },
        AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]),
      )
      .then((data) => {
        if (!active) return;
        // Only Economy is currently live. Avoid reopening the screen with a
        // persisted, disabled Comfort/XL choice.
        const current = data.offers.find((offer) => offer.category === selectedRef.current);
        if (data.source === "service" && current?.availability !== "available") {
          const available = data.offers.find((offer) => offer.availability === "available");
          if (available) {
            selectedRef.current = available.category;
            setSelected(available.category);
          }
        }
        const old = prior.current;
        if (old?.source === "service" && data.source === "service" &&
            pricingFingerprint(old) !== pricingFingerprint(data)) {
          const before = old.offers.find(
            (o) => o.category === selectedRef.current,
          )!;
          const after = data.offers.find(
            (o) => o.category === selectedRef.current,
          )!;
          setChanged({ old: fareTotal(before), next: fareTotal(after) });
        }
        if (!old || old.source !== "service" || data.source !== "service") setChanged(null);
        prior.current = data;
        setFares(data);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        const code = error instanceof Error ? error.message : "";
        // Authentication and invalid journeys are actionable errors, not
        // service outages; never mislabel them as demo pricing.
        if (/^fares_http_(401|403)$/.test(code)) {
          setLoadError("auth");
          setLoadState("error");
          return;
        }
        if (/^fares_http_(400|422)$/.test(code)) {
          setLoadError("journey");
          setLoadState("error");
          return;
        }
        // Only genuine service/network failures use non-bookable estimates.
        try {
          const sample = {
            ...previewFares({
              pickup: journey.pickup!,
              destination: journey.destination!,
            }),
            previewReason: "service_unavailable" as const,
          };
          prior.current = null;
          setChanged(null);
          setFares(sample);
          setLoadState("ready");
        } catch {
          setLoadState("error");
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
    // Only selected coordinates/validity and an explicit refresh change quotes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, journey.canContinue, refresh]);
  useEffect(() => {
    if (!fares || requestState === "accepted") return;
    const remaining = Date.parse(fares.expiresAt) - Date.now();
    const timer = setTimeout(load, Math.max(0, remaining));
    const visible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.parse(fares.expiresAt) <= Date.now()
      )
        load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [fares, load, requestState]);
  const ready =
    loadState === "ready" &&
    !!chosen &&
    chosen.amount !== null &&
    chosen.availability !== "unavailable" &&
    journey.canContinue &&
    !changed &&
    requestState !== "pending" &&
    requestState !== "accepted" &&
    requestState !== "unavailable";
  const canRequest =
    ready &&
    fares?.source === "service" &&
    fares.chargesComplete &&
    chosen?.availability === "available" &&
    Date.parse(fares.expiresAt) > Date.now();
  const canPreview = ready && fares?.source === "preview";
  const request = async () => {
    if (
      lock.current ||
      !canRequest ||
      !fares ||
      !chosen ||
      !journey.pickup ||
      !journey.destination
    )
      return;
    if (Date.parse(fares.expiresAt) <= Date.now()) {
      load();
      return;
    }
    lock.current = true;
    onPending(true);
    setRequestState("pending");
    const signature = `${key};${fares.revision};${chosen.id};cash`;
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await bookingAdapter.request(
        { pickup: journey.pickup, destination: journey.destination },
        chosen,
        fares.revision,
        attempt.current.key,
      );
      if (!mounted.current) return;
      if (result.status === "price_changed") {
        const updated = result.fares.offers.find(
          (o) => o.category === selected,
        )!;
        prior.current = result.fares;
        setFares(result.fares);
        setLoadState("ready");
        setChanged({ old: fareTotal(chosen), next: fareTotal(updated) });
        setRequestState("idle");
      } else if (result.status === "accepted") {
        setRequestId(result.requestId);
        setRequestState("accepted");
        onPending(false);
        onCreated(result.requestId, chosen);
      } else setRequestState(result.status);
    } catch {
      if (mounted.current) setRequestState("unknown");
    } finally {
      lock.current = false;
      onPending(false);
    }
  };
  return {
    fares,
    chosen,
    selected,
    setSelected,
    loadState,
    loadError,
    requestState,
    requestId,
    changed,
    load,
    request,
    canRequest,
    canPreview,
    acceptPrice: () => {
      setChanged(null);
      attempt.current = null;
      setRequestState("idle");
    },
  };
}

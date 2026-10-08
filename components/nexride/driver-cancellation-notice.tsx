"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { emitNexRideFeedback, stopRideRequestAlert } from "../../lib/nexride-feedback";
import { Icon, LanguageContext } from "./ui";
import "./driver-cancellation-notice.css";

type CancellationEvent = {
  ride_request_id: string;
  driver_id: string;
  previous_status: string;
  cancelled_at: string;
};

const seenKey = (driverId: string, rideId: string) =>
  "nexride.driver.cancellation.ack:" + driverId + ":" + rideId;

export function DriverCancellationNotice({ pathname }: { pathname: string }) {
  const router = useRouter();
  const language = useContext(LanguageContext);
  const [notice, setNotice] = useState<CancellationEvent | null>(null);
  const [driverId, setDriverId] = useState("");
  const presented = useRef(new Set<string>());
  const isAm = language === "am";
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setDriverId(data.session?.user.id || "");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setDriverId(session?.user.id || "");
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!driverId) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reading = false;
    const present = (event: CancellationEvent) => {
      if (!active || event.driver_id !== driverId) return;
      const key = seenKey(driverId, event.ride_request_id);
      if (presented.current.has(key)) return;
      try { if (localStorage.getItem(key) === "1") return; } catch {}
      presented.current.add(key);
      setNotice(current => current || event);
      stopRideRequestAlert();
      emitNexRideFeedback({
        event: "cancelled",
        id: "rider-cancel:" + event.ride_request_id + ":" + driverId,
        title: "Ride cancelled",
        body: "The rider has cancelled this trip. You can now receive another ride request.",
        url: "/driver/home",
      });
    };
    const pull = async () => {
      if (!navigator.onLine || reading) return;
      reading = true;
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase.from("ride_cancellation_events")
          .select("ride_request_id,driver_id,previous_status,cancelled_at")
          .eq("driver_id", driverId).gte("cancelled_at", since)
          .order("cancelled_at", { ascending: false }).limit(10);
        if (!error && active) (data || []).forEach(row => present(row as CancellationEvent));
      } finally { reading = false; }
    };
    channel = supabase.channel("driver-cancellations:" + driverId)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "ride_cancellation_events",
        filter: "driver_id=eq." + driverId,
      }, payload => present(payload.new as CancellationEvent))
      .subscribe(status => { if (status === "SUBSCRIBED") void pull(); });
    const onVisible = () => { if (document.visibilityState === "visible") void pull(); };
    window.addEventListener("online", pull);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void pull(), 20000);
    void pull();
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", pull);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [driverId]);

  if (!notice) return null;
  const stopFirst = notice.previous_status === "in_trip";
  const acknowledge = () => {
    try { localStorage.setItem(seenKey(driverId, notice.ride_request_id), "1"); } catch {}
    setNotice(null);
    if (pathname.startsWith("/driver/navigation") || pathname.startsWith("/driver/pickup") || pathname.startsWith("/driver/request")) {
      router.replace("/driver/home");
    }
  };
  return (
    <div className="nr-driver-cancel-overlay" role="presentation">
      <section className="nr-driver-cancel-card" role="alertdialog" aria-modal="true"
        aria-labelledby="nr-driver-cancel-title" aria-describedby="nr-driver-cancel-description">
        <span className="nr-driver-cancel-symbol"><Icon name="info" size={26} /></span>
        <h2 id="nr-driver-cancel-title">{isAm ? "ጉዞው ተሰርዟል" : "Ride cancelled"}</h2>
        <p id="nr-driver-cancel-description">{isAm
          ? "ተሳፋሪው ጉዞውን ሰርዟል። እንደገና ሌላ የጉዞ ጥያቄ መቀበል ይችላሉ።"
          : "The rider has cancelled this trip. You can now receive another ride request."}</p>
        {stopFirst && <p className="nr-driver-cancel-safety">{isAm
          ? "እየነዱ ከሆነ ከዚህ ገጽ ከመውጣትዎ በፊት በደህና ቦታ ያቁሙ።"
          : "If you are driving, stop in a safe location before leaving this screen."}</p>}
        <button type="button" autoFocus onClick={acknowledge}>
          {isAm ? "አረጋግጥኩ · ወደ መነሻ" : "Acknowledge · Driver Home"}
        </button>
      </section>
    </div>
  );
}

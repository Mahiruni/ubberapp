"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RideMap } from "../../../components/nexride/map";
import { Icon } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import "../../nexride.css";
import "../request/driver-request.css";
import "./pickup.css";

type PickupData = {
  offerId: string;
  requestId: string;
  pickup: string;
  destination: string;
  pickupLat: number | null;
  pickupLng: number | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  rideCategory: string;
};

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export default function DriverPickupPage() {
  const router = useRouter();
  const [data, setData] = useState<PickupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!active) return;
      if (!session || session.user.user_metadata?.role !== "driver") {
        router.replace("/driver/auth");
        return;
      }

      const offerId = new URLSearchParams(window.location.search).get("offer");
      if (!offerId) {
        setMessage("No accepted ride was provided.");
        setLoading(false);
        return;
      }

      const { data: offer, error: offerError } = await supabase
        .from("ride_request_offers")
        .select("id,request_id,status,pickup_distance_km,pickup_eta_minutes")
        .eq("id", offerId)
        .eq("driver_id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (offerError || !offer || offer.status !== "accepted") {
        setMessage(
          offer?.status === "withdrawn"
            ? "This ride is no longer assigned to you."
            : "This ride is not available for pickup navigation.",
        );
        setLoading(false);
        return;
      }

      const { data: ride, error: rideError } = await supabase
        .from("ride_requests")
        .select("id,pickup_location,destination_location,pickup_lat,pickup_lng,ride_category,assigned_driver_id,status")
        .eq("id", offer.request_id)
        .maybeSingle();

      if (!active) return;

      if (
        rideError ||
        !ride ||
        ride.assigned_driver_id !== session.user.id ||
        ride.status !== "accepted"
      ) {
        setMessage("The ride assignment could not be confirmed.");
        setLoading(false);
        return;
      }

      setData({
        offerId: offer.id,
        requestId: ride.id,
        pickup: ride.pickup_location,
        destination: ride.destination_location,
        pickupLat: asNumber(ride.pickup_lat),
        pickupLng: asNumber(ride.pickup_lng),
        distanceKm: asNumber(offer.pickup_distance_km),
        etaMinutes: asNumber(offer.pickup_eta_minutes),
        rideCategory: ride.ride_category || "Ride",
      });
      setLoading(false);
    })().catch(() => {
      if (active) {
        setMessage("Pickup navigation could not be loaded.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  const mapsUrl =
    data?.pickupLat !== null &&
    data?.pickupLat !== undefined &&
    data?.pickupLng !== null &&
    data?.pickupLng !== undefined
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${data.pickupLat},${data.pickupLng}`)}`
      : "";

  return (
    <main className="nr-app nr-driver-pickup-page" data-mode="driver" data-theme="dark">
      <div className="nr-pickup-map">
        <RideMap route driving />
      </div>

      <button
        className="nr-request-back"
        onClick={() => router.replace("/driver/home")}
        aria-label="Back to driver home"
      >
        <Icon name="back" />
      </button>

      {loading ? (
        <section className="nr-pickup-card" aria-busy="true">
          <div className="nr-request-loading"><span /><span /><span /></div>
        </section>
      ) : message || !data ? (
        <section className="nr-pickup-card">
          <div className="nr-request-state">
            <span><Icon name="info" size={24} /></span>
            <h1>Pickup unavailable</h1>
            <p>{message || "This ride could not be loaded."}</p>
            <button onClick={() => router.replace("/driver/home")}>Back to Driver Home</button>
          </div>
        </section>
      ) : (
        <section className="nr-pickup-card" aria-live="polite">
          <div className="nr-pickup-topline">
            <span className="nr-pickup-live"><i /> ACCEPTED</span>
            <span>{data.rideCategory}</span>
          </div>

          <div className="nr-pickup-heading">
            <span className="nr-pickup-navigation-icon"><Icon name="navigation" size={22} /></span>
            <div>
              <small>NAVIGATE TO PICKUP</small>
              <h1>{data.pickup}</h1>
            </div>
          </div>

          {(data.distanceKm !== null || data.etaMinutes !== null) && (
            <div className="nr-pickup-facts">
              {data.etaMinutes !== null && <div><small>ETA</small><strong>{data.etaMinutes} min</strong></div>}
              {data.distanceKm !== null && <div><small>Distance</small><strong>{data.distanceKm.toFixed(1)} km</strong></div>}
            </div>
          )}

          <div className="nr-pickup-destination">
            <span><Icon name="pin" size={17} /></span>
            <div><small>Trip destination</small><strong>{data.destination}</strong></div>
          </div>

          {mapsUrl ? (
            <a className="nr-pickup-open-navigation" href={mapsUrl} target="_blank" rel="noreferrer">
              <Icon name="navigation" size={18} />
              Open navigation
            </a>
          ) : (
            <div className="nr-pickup-map-note">
              <Icon name="info" size={16} />
              <span>Precise pickup coordinates were not supplied, so external navigation is unavailable.</span>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

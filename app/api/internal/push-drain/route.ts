import { createSign } from "node:crypto";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { nexrideDriverOfferTtlSeconds } from "../../../../lib/nexride-push-routing";
import { nativeDriverAlertData } from "../../../../lib/biloo-native-driver-alert-payload";
import { notificationTestSettingsUrl, notificationTestTtlSeconds } from "../../../../lib/biloo-notification-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
type Event = {
  id: string; kind: "driver_offer" | "driver_offer_closed" | "rider_trip" | "device_test"; role: "driver" | "rider";
  user_id: string; offer_id: string | null; request_id: string | null;
  expected_status: string | null; attempts: number; created_at?: string; device_id?: string | null;
};

function signedAssertion(config: ServiceAccount) {
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = encode({ iss: config.client_email, sub: config.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/firebase.messaging", iat: now, exp: now + 3500 });
  const unsigned = encode({ alg: "RS256", typ: "JWT" }) + "." + body;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(config.private_key).toString("base64url");
  return unsigned + "." + signature;
}
async function firebaseAccessToken(config: ServiceAccount) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedAssertion(config) }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("fcm_oauth_failed");
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error("fcm_oauth_no_token");
  return result.access_token;
}
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const allowed = [process.env.CRON_SECRET, process.env.NEXRIDE_PUSH_WORKER_SECRET]
    .some(secret => !!secret && secret.length >= 20 && authorization === "Bearer " + secret);
  if (!allowed)
    return Response.json({ status: "unauthorized" }, { status: 401 });
  let config: ServiceAccount;
  try {
    config = process.env.GOOGLE_FCM_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.GOOGLE_FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount
      : { project_id: process.env.FCM_PROJECT_ID || "",
          client_email: process.env.FCM_CLIENT_EMAIL || "",
          private_key: (process.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n") };
    if (!config.project_id || !config.client_email || !config.private_key) throw new Error("missing_fcm");
  } catch { return Response.json({ status: "fcm_not_configured" }, { status: 503 }); }
  try {
    const admin = serverAdminSupabase();
    // A 10-second worker must not request a Google OAuth token while idle.
    const { data: queued, error: queueError } = await admin.from("nexride_push_outbox")
      .select("id").in("status", ["pending", "processing"]).limit(1);
    if (queueError) throw new Error("outbox_probe_failed");
    if (!queued?.length) return Response.json({ status: "idle", events: 0 },
      { headers: { "Cache-Control": "no-store" } });

    // A missing FCM integration never claims events or fabricates success.
    const access = await firebaseAccessToken(config);
    const { data: events, error } = await admin.rpc("nexride_claim_native_push_server", { p_limit: 20 });
    if (error) throw new Error("outbox_claim_failed");
    let sent = 0, skipped = 0, retried = 0;
    for (const event of (events ?? []) as Event[]) {
      const finish = async (status: string, reason = "") => {
        const retryDelay = event.kind === "rider_trip"
          ? Math.min(60, Math.pow(2, event.attempts)) * 60_000
          : Math.min(5, Math.pow(2, event.attempts)) * 1000;
        await admin.from("nexride_push_outbox").update({
          status, retry_at: new Date(Date.now() + retryDelay).toISOString(),
          delivered_at: status === "sent" ? new Date().toISOString() : null,
          last_error: reason || null,
        }).eq("id", event.id).eq("status", "processing");
      };
      try {
        const testing = event.kind === "device_test";
        if (testing && (!event.device_id || event.role !== "driver" || !notificationTestTtlSeconds(event.created_at))) {
          await finish("skipped", "test_expired_or_missing_device"); skipped++; continue;
        }
        const driverEvent = event.kind === "driver_offer" || event.kind === "driver_offer_closed";
        const closing = event.kind === "driver_offer_closed";
        let driverOffer: Parameters<typeof nativeDriverAlertData>[1] = null;
        let offeredRide: Parameters<typeof nativeDriverAlertData>[2] = null;
        let offerExpiresAt: string | null = null;
        let confirmedTripStatus: string | null = null;
        let assignedDriverId: string | null = null;
        let riderId: string | null = null;
        if (driverEvent) {
          const { data: offer } = await admin.from("ride_request_offers")
            .select("id,request_id,status,expires_at,driver_id,created_at,pickup_distance_km,pickup_eta_minutes").eq("id", event.offer_id).maybeSingle();
          if (!closing && (!offer || offer.status !== "pending" || offer.driver_id !== event.user_id ||
            nexrideDriverOfferTtlSeconds(offer.expires_at) === 0)) {
            await finish("skipped", "offer_no_longer_pending"); skipped++; continue;
          }
          driverOffer = offer;
          offerExpiresAt = offer?.expires_at ?? null;
          if (!closing) {
            const { data: eligibility } = await admin.from("drivers").select("is_online,review_status")
              .eq("id", event.user_id).maybeSingle();
            const { data: profile } = await admin.from("profiles").select("account_status")
              .eq("id", event.user_id).maybeSingle();
            if (!eligibility?.is_online || eligibility.review_status !== "approved" || profile?.account_status !== "active") {
              await finish("skipped", "driver_not_eligible"); skipped++; continue;
            }
            const { data: ride } = await admin.from("ride_requests")
              .select("rider_id,status,assigned_driver_id,pickup_location,estimated_driver_payout_etb,estimated_trip_fare_etb").eq("id", offer!.request_id).maybeSingle();
            if (!ride || !["pending", "requested", "searching"].includes(ride.status) || ride.assigned_driver_id) {
              await finish("skipped", "ride_no_longer_searching"); skipped++; continue;
            }
            offeredRide = ride; riderId = ride.rider_id || null;
          }
        } else if (!testing) {
          const { data: ride } = await admin.from("ride_requests")
            .select("status,rider_id,assigned_driver_id").eq("id", event.request_id).maybeSingle();
          if (!ride || ride.status !== event.expected_status || ride.rider_id !== event.user_id) {
            await finish("skipped", "ride_state_changed"); skipped++; continue;
          }
          confirmedTripStatus = ride.status;
          assignedDriverId = ride.assigned_driver_id || null;
        }
        let deviceQuery = admin.from("nexride_push_devices")
          .select("id,fcm_token,alert_protocol").eq("user_id", event.user_id).eq("role", event.role).eq("enabled", true);
        if (testing) deviceQuery = deviceQuery.eq("id", event.device_id!);
        const { data: devices, error: deviceError } = await deviceQuery;
        if (deviceError) throw new Error("device_lookup_failed");
        if (!devices?.length) { await finish("skipped", "no_registered_device"); skipped++; continue; }
        // Only describe the state we just confirmed in the database.
        const tripCopy: Record<string, { title: string; body: string }> = {
          requested: { title: "Ride requested", body: "We've got your request! We're finding a driver for you." },
          searching: { title: "Finding your driver", body: "We're finding a driver for you. We'll let you know when one accepts." },
          pending: { title: "Ride requested", body: "Your request is in! We'll let you know when a driver accepts." },
          accepted: { title: "Driver confirmed", body: "Great news! Your driver has accepted your ride. See your pickup details in Biloo." },
          assigned: { title: "Driver confirmed", body: "Good news! Your driver is confirmed. Check your pickup details in Biloo." },
          arriving: { title: "Driver on the way", body: "Your driver is on the way to meet you." },
          approaching: { title: "Driver on the way", body: "Your driver is getting close to your pickup spot." },
          arrived: { title: "Driver arrived", body: "Your driver is here! Head to your pickup spot when you're ready." },
          arrived_pickup: { title: "Driver arrived", body: "Your driver is here! Head to your pickup spot when you're ready." },
          in_trip: { title: "Trip started", body: "You're on your way! Have a lovely ride." },
          started: { title: "Trip started", body: "You're on your way! Have a lovely ride." },
          completed: { title: "Trip completed", body: "You've arrived! Thanks for riding with Biloo." },
          cancelled: { title: "Trip cancelled", body: "Your ride has been cancelled. You can check the details in Biloo." },
          canceled: { title: "Trip cancelled", body: "Your ride has been cancelled. You can check the details in Biloo." },
        };
        const copy = testing ? { title: "BILOO notification test", body: "Your phone received a BILOO test alert. Tap to return to Ride alerts." }
          : closing ? { title: "Ride request closed", body: "This offer is no longer available." } : event.kind === "driver_offer"
          ? { title: "New Biloo ride request", body: "A rider is waiting for a driver! Open Biloo to review the request." }
          : confirmedTripStatus ? tripCopy[confirmedTripStatus] : undefined;
        // Unknown states must not produce misleading or generic push notifications.
        if (!copy) { await finish("skipped", "unrecognized_trip_status"); skipped++; continue; }
        const counterpartId = event.kind === "driver_offer" ? riderId : assignedDriverId;
        let counterpartName = "";
        if (counterpartId) {
          const { data: counterpart } = await admin.from("profiles")
            .select("full_name").eq("id", counterpartId).maybeSingle();
          const candidate = typeof counterpart?.full_name === "string"
            ? counterpart.full_name.replace(/[\r\n\t]+/g, " ").trim().slice(0, 60) : "";
          if (candidate.length >= 2) counterpartName = candidate;
        }
        const title = counterpartName && event.kind === "driver_offer"
          ? "Ride request from " + counterpartName
          : counterpartName && ["accepted", "assigned", "arriving", "approaching", "arrived", "arrived_pickup"].includes(confirmedTripStatus || "")
            ? copy.title + " · " + counterpartName
            : copy.title;
        const body = counterpartName && event.kind === "driver_offer"
          ? counterpartName + " is looking for a ride. Tap to review the request."
          : counterpartName && ["accepted", "assigned"].includes(confirmedTripStatus || "")
            ? counterpartName + " is your driver! Tap to see your pickup details."
            : counterpartName && ["arriving", "approaching"].includes(confirmedTripStatus || "")
              ? counterpartName + " is on the way to meet you."
              : counterpartName && ["arrived", "arrived_pickup"].includes(confirmedTripStatus || "")
                ? counterpartName + " is here! Head to your pickup spot when you're ready."
                : copy.body;
        const url = testing ? notificationTestSettingsUrl : event.kind === "driver_offer" ?
          "/driver/request?offer=" + event.offer_id : event.request_id ? "/rider/trips/" + event.request_id : "/rider/trips";
        // An offer can expire while we resolve devices; do not ring stale requests.
        const remainingTtl = testing ? notificationTestTtlSeconds(event.created_at) : closing ? 60 : event.kind === "driver_offer"
          ? nexrideDriverOfferTtlSeconds(offerExpiresAt) : 300;
        if (remainingTtl === 0) {
          await finish("skipped", "offer_expired_before_fcm"); skipped++; continue;
        }
        // Dispatch to registered devices concurrently; one slow device must not delay others.
        let successes = 0;
        for (const device of devices) {
          const nativeAlert = driverEvent && device.alert_protocol === 1 && !!event.offer_id;
          if (closing && !nativeAlert) continue;
          // A versioned data-only message reaches native code while the WebView
          // is absent. Legacy APKs retain their existing system-tray behavior.
          const data = nativeAlert ? nativeDriverAlertData({ ...event,
            kind: closing ? "driver_offer_closed" : "driver_offer", offer_id: event.offer_id! }, driverOffer, offeredRide) : {
            url, kind: event.kind, eventId: event.id,
            ...(offerExpiresAt ? { expiresAt: offerExpiresAt } : {}),
          };
          const sentResponse = await fetch(
            "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(config.project_id) + "/messages:send",
            { method: "POST",
              headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
              body: JSON.stringify({ message: { token: device.fcm_token,
                ...(!nativeAlert ? { notification: { title, body } } : {}), data,
                android: {
                  priority: driverEvent || testing ? "HIGH" : "NORMAL",
                  // TTL cannot exceed the server-owned 30-second offer window.
                  ttl: `${remainingTtl}s`,
                  // Offer-scoped keys prevent a late close from replacing a
                  // newer offer for the same driver while the device is offline.
                  collapse_key: testing ? "biloo_notification_test" : nativeAlert ? "biloo_offer_" + event.offer_id : event.kind === "driver_offer" ? "biloo_active_ride_offer" : "biloo_trip_" + event.request_id,
                  ...(!nativeAlert ? { notification: {
                    channel_id: event.kind === "driver_offer" || testing
                      ? "nexride_driver_requests_v2" : "nexride_trip_updates",
                    // New offers replace older notification tray entries.
                    tag: testing ? "biloo_notification_test" : event.kind === "driver_offer" ? "biloo_active_ride_offer" : "biloo_trip_" + event.request_id,
                    ...(event.kind === "driver_offer" || testing ? { sound: "nexride_ride_request" } : {}),
                  } } : {}),
                },
              } }),
              signal: AbortSignal.timeout(12000),
            });
          if (sentResponse.ok) { successes++; continue; }
          const raw = await sentResponse.text();
          if (raw.includes("UNREGISTERED")) {
            await admin.from("nexride_push_devices").delete().eq("id", device.id);
            continue;
          }
          throw new Error("fcm_delivery_rejected_" + sentResponse.status);
        }
        await finish(successes ? "sent" : "skipped", successes ? "" : "no_valid_device");
        sent += successes; if (!successes) skipped++;
      } catch (err) {
        await finish(event.attempts >= 6 ? "skipped" : "pending",
          err instanceof Error ? err.message.slice(0,120) : "retryable_send_failure");
        retried++;
      }
    }
    return Response.json({ status: "processed", events: (events ?? []).length, acceptedByFcm: sent, skipped, retried },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "worker_unavailable" }, { status: 503 });
  }
}

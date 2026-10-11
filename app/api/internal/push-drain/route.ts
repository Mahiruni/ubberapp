import { createSign } from "node:crypto";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
type Event = {
  id: string; kind: "driver_offer" | "rider_trip"; role: "driver" | "rider";
  user_id: string; offer_id: string | null; request_id: string | null;
  expected_status: string | null; attempts: number;
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
        const retryDelay = Math.min(60, Math.pow(2, event.attempts)) * 60_000;
        await admin.from("nexride_push_outbox").update({
          status, retry_at: new Date(Date.now() + retryDelay).toISOString(),
          delivered_at: status === "sent" ? new Date().toISOString() : null,
          last_error: reason || null,
        }).eq("id", event.id).eq("status", "processing");
      };
      try {
        if (event.kind === "driver_offer") {
          const { data: offer } = await admin.from("ride_request_offers")
            .select("status,expires_at,driver_id").eq("id", event.offer_id).maybeSingle();
          if (!offer || offer.status !== "pending" || offer.driver_id !== event.user_id ||
            (offer.expires_at && Date.parse(offer.expires_at) <= Date.now())) {
            await finish("skipped", "offer_no_longer_pending"); skipped++; continue;
          }
        } else {
          const { data: ride } = await admin.from("ride_requests")
            .select("status,rider_id").eq("id", event.request_id).maybeSingle();
          if (!ride || ride.status !== event.expected_status || ride.rider_id !== event.user_id) {
            await finish("skipped", "ride_state_changed"); skipped++; continue;
          }
        }
        const { data: devices, error: deviceError } = await admin.from("nexride_push_devices")
          .select("id,fcm_token").eq("user_id", event.user_id).eq("role", event.role).eq("enabled", true);
        if (deviceError) throw new Error("device_lookup_failed");
        if (!devices?.length) { await finish("skipped", "no_registered_device"); skipped++; continue; }
        const title = event.kind === "driver_offer" ? "New NexRide ride request" : "NexRide trip update";
        const body = event.kind === "driver_offer" ? "Open NexRide to review your active ride offer." :
          "Your trip status has changed. Open NexRide for details.";
        const url = event.kind === "driver_offer" ?
          "/driver/request?offer=" + event.offer_id : "/rider/trips";
        let successes = 0;
        for (const device of devices) {
          const sentResponse = await fetch(
            "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(config.project_id) + "/messages:send",
            { method: "POST",
              headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
              body: JSON.stringify({ message: { token: device.fcm_token,
                notification: { title, body },
                data: { url, kind: event.kind, eventId: event.id },
                android: { priority: event.kind === "driver_offer" ? "HIGH" : "NORMAL",
                  ttl: event.kind === "driver_offer" ? "40s" : "300s",
                  notification: { channel_id: event.kind === "driver_offer" ? "nexride_driver_requests" : "nexride_trip_updates",
                    tag: event.id } } } }),
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

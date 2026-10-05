import { withSupabase } from "npm:@supabase/server";

type Payload = {
  operation?: "create" | "snapshot" | "action";
  requestId?: string;
  expectedVersion?: number;
  action?: "cancel" | "retry";
  pickupLocation?: string;
  destinationLocation?: string;
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  category?: string;
  paymentMethod?: string;
  clientRequestKey?: string;
  pricingRevision?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const actor = ctx.userClaims?.id;
    if (!actor) return json({ error: "auth_required" }, 401);

    let body: Payload;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (body.operation === "create") {
      const { data, error } = await ctx.supabaseAdmin.rpc(
        "rider_create_ride_request_server",
        {
          p_actor: actor,
          p_pickup_location: body.pickupLocation,
          p_destination_location: body.destinationLocation,
          p_pickup_lat: body.pickupLat,
          p_pickup_lng: body.pickupLng,
          p_destination_lat: body.destinationLat,
          p_destination_lng: body.destinationLng,
          p_category: body.category,
          p_payment_method: body.paymentMethod,
          p_client_request_key: body.clientRequestKey,
          p_pricing_revision: body.pricingRevision ?? null,
        },
      );
      if (error) return json({ error: error.message }, 400);
      return json(data, 201);
    }

    if (body.operation === "snapshot") {
      if (!body.requestId) return json({ error: "request_id_required" }, 400);
      const { data, error } = await ctx.supabaseAdmin.rpc(
        "rider_match_snapshot_server",
        { p_actor: actor, p_request_id: body.requestId },
      );
      if (error) {
        const status = error.message.includes("REQUEST_NOT_FOUND") ? 404 : 400;
        return json({ error: error.message }, status);
      }
      return json(data);
    }

    if (body.operation === "action") {
      if (
        !body.requestId ||
        !Number.isSafeInteger(body.expectedVersion) ||
        (body.action !== "cancel" && body.action !== "retry")
      ) {
        return json({ error: "invalid_action" }, 400);
      }
      const { data, error } = await ctx.supabaseAdmin.rpc(
        "rider_request_action_server",
        {
          p_actor: actor,
          p_request_id: body.requestId,
          p_expected_version: body.expectedVersion,
          p_action: body.action,
        },
      );
      if (error) {
        const status = error.message.includes("REQUEST_NOT_FOUND") ? 404 : 400;
        return json({ error: error.message }, status);
      }
      return json(data);
    }

    return json({ error: "invalid_operation" }, 400);
  }),
};

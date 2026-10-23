"use client";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { resolveSessionRole } from "./nexride-account-role";
import { withOperationTimeout } from "./nexride-operation";

export type DriverReviewStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";
export type DriverDestination = "/admin" | "/driver/auth" | "/driver/onboarding" | "/driver/verification" | "/driver/home";

export async function getDriverReviewStatus(userId: string): Promise<DriverReviewStatus> {
  const { data, error } = await withOperationTimeout(supabase
    .from("drivers")
    .select("review_status")
    .eq("id", userId)
    .maybeSingle().retry(false));

  if (error) throw error;
  const status = data?.review_status;
  return status === "pending" || status === "approved" || status === "rejected" || status === "suspended"
    ? status
    : "draft";
}

export async function driverResumeDestination(session: Session, databaseRole?: string): Promise<DriverDestination> {
  const role = databaseRole ?? await resolveSessionRole(session);
  if (role === "admin") return "/admin";
  if (role !== "driver") return "/driver/onboarding";

  const { data, error } = await withOperationTimeout(supabase.from("drivers")
    .select("review_status,vehicle,vehicle_color,vehicle_plate")
    .eq("id", session.user.id).maybeSingle().retry(false));
  // An outage is recoverable, never evidence of approval.
  if (error) throw error;
  if (!data) return "/driver/onboarding";
  if (data.review_status === "approved") return "/driver/home";
  if (data.review_status !== "draft") return "/driver/verification";

  // Legacy signup stored vehicle drafts in Auth metadata. Use that only as
  // an onboarding hint; no metadata flag can unlock the operational home.
  const metadata = session.user.user_metadata || {};
  const hasVehicleDraft = [data.vehicle || metadata.vehicle,
    data.vehicle_color || metadata.vehicle_color,
    data.vehicle_plate || metadata.vehicle_plate]
    .every(value => typeof value === "string" && value.trim());
  return hasVehicleDraft ? "/driver/verification" : "/driver/onboarding";
}

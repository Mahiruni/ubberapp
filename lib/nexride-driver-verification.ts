"use client";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { resolveSessionRole } from "./nexride-account-role";

export type DriverReviewStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";
export type DriverDestination = "/driver/auth" | "/driver/onboarding" | "/driver/verification" | "/driver/home";

export async function getDriverReviewStatus(userId: string): Promise<DriverReviewStatus> {
  const { data, error } = await supabase
    .from("drivers")
    .select("review_status")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  const status = data?.review_status;
  return status === "pending" || status === "approved" || status === "rejected" || status === "suspended"
    ? status
    : "draft";
}

export async function driverResumeDestination(
  session: Session,
  alreadyVerifiedRole?: string,
): Promise<DriverDestination> {
  // The Driver welcome gate has already fetched the authoritative role.
  // Reuse it rather than paying for the same profile query twice.
  const role = alreadyVerifiedRole ?? await resolveSessionRole(session);
  if (role !== "driver") return "/driver/auth";
  if (session.user.user_metadata?.driver_onboarding_complete !== true) return "/driver/onboarding";

  try {
    const status = await getDriverReviewStatus(session.user.id);
    return status === "draft" || status === "rejected" ? "/driver/verification" : "/driver/home";
  } catch {
    return "/driver/home";
  }
}

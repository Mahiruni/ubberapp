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

export async function driverResumeDestination(session: Session): Promise<DriverDestination> {
  if ((await resolveSessionRole(session)) !== "driver") return "/driver/auth";
  try {
    // Only the database decides whether a Driver is approved or has begun
    // verification. user_metadata is editable and must not grant eligibility.
    const [driver, progress] = await Promise.all([
      supabase.from("drivers").select("review_status")
        .eq("id", session.user.id).maybeSingle(),
      supabase.from("account_role_onboarding").select("status")
        .eq("user_id", session.user.id).eq("role", "driver").maybeSingle(),
    ]);
    if (driver.error || progress.error) return "/driver/auth";
    if (!driver.data || !progress.data) return "/driver/onboarding";
    if (driver.data.review_status === "approved" &&
      progress.data.status === "approved") return "/driver/home";
    if (["submitted", "under_review", "rejected", "suspended"].includes(progress.data.status))
      return "/driver/verification";
    return session.user.user_metadata?.driver_onboarding_complete === true
      ? "/driver/verification"
      : "/driver/onboarding";
  } catch {
    // A lost verification service must never be interpreted as approval.
    return "/driver/auth";
  }
}

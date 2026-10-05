import { supabase } from "./supabase";

export type DriverReviewStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";
export type DriverDocumentStatus = "Missing" | "Submitted" | "Under Review" | "Approved" | "Expired" | "Rejected" | "Restricted";

export type DriverProfileData = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  avatarUrl: string;
  role: string;
  accountStatus: "active" | "suspended" | "disabled" | string;
  rating: number | null;
  completedTrips: number | null;
  vehicle: string;
  vehiclePlate: string;
  licenseNumber: string;
  licenseExpiry: string;
  licenseDocumentPath: string;
  vehicleRegistrationPath: string;
  reviewStatus: DriverReviewStatus;
  rejectionReason: string;
  submittedAt: string;
  reviewedAt: string;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function normalizeDriverReviewStatus(value: unknown): DriverReviewStatus {
  return value === "pending" || value === "approved" || value === "rejected" || value === "suspended"
    ? value
    : "draft";
}

export async function loadDriverProfileData(userId: string): Promise<DriverProfileData> {
  const [sessionResult, profileResult, driverResult, tripsResult] = await Promise.all([
    supabase.auth.getSession(),
    supabase
      .from("profiles")
      .select("full_name,phone,role,account_status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("drivers")
      .select("vehicle,vehicle_plate,license_number,license_expiry,license_document_path,vehicle_registration_path,rating,review_status,rejection_reason,submitted_at,reviewed_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("ride_requests")
      .select("id", { count: "exact", head: true })
      .eq("assigned_driver_id", userId)
      .eq("status", "completed"),
  ]);

  const session = sessionResult.data.session;
  const metadata = session?.user.user_metadata || {};
  const profile = profileResult.data;
  const driver = driverResult.data;

  if (profileResult.error) throw profileResult.error;
  if (driverResult.error) throw driverResult.error;

  return {
    id: userId,
    fullName: text(profile?.full_name) || text(metadata.full_name) || text(metadata.name) || "Driver",
    phone: text(profile?.phone) || text(metadata.phone),
    email: text(session?.user.email),
    avatarUrl: text(metadata.avatar_url) || text(metadata.avatarUrl),
    role: text(profile?.role),
    accountStatus: text(profile?.account_status) || "active",
    rating: number(driver?.rating),
    completedTrips: tripsResult.error ? null : tripsResult.count ?? 0,
    vehicle: text(driver?.vehicle) || text(metadata.vehicle),
    vehiclePlate: text(driver?.vehicle_plate) || text(metadata.vehicle_plate),
    licenseNumber: text(driver?.license_number),
    licenseExpiry: text(driver?.license_expiry),
    licenseDocumentPath: text(driver?.license_document_path),
    vehicleRegistrationPath: text(driver?.vehicle_registration_path),
    reviewStatus: normalizeDriverReviewStatus(driver?.review_status),
    rejectionReason: text(driver?.rejection_reason),
    submittedAt: text(driver?.submitted_at),
    reviewedAt: text(driver?.reviewed_at),
  };
}

export function documentStatus(
  profile: DriverProfileData,
  kind: "license" | "registration",
): DriverDocumentStatus {
  const path = kind === "license" ? profile.licenseDocumentPath : profile.vehicleRegistrationPath;
  if (!path) return "Missing";

  if (kind === "license" && profile.licenseExpiry) {
    const expiry = new Date(`${profile.licenseExpiry}T23:59:59`);
    if (Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now()) return "Expired";
  }

  if (profile.reviewStatus === "suspended") return "Restricted";
  if (profile.reviewStatus === "rejected") return "Rejected";
  if (profile.reviewStatus === "pending") return "Under Review";
  if (profile.reviewStatus === "approved") return "Approved";
  return "Submitted";
}

export function verificationSummary(profile: DriverProfileData) {
  if (profile.accountStatus !== "active") {
    return {
      tone: "restricted" as const,
      title: "Account restricted",
      detail: "Some driver actions are unavailable while this account is restricted.",
    };
  }
  if (profile.reviewStatus === "approved") {
    return {
      tone: "approved" as const,
      title: "Verified driver",
      detail: "Your current driver and vehicle documents are approved.",
    };
  }
  if (profile.reviewStatus === "pending") {
    return {
      tone: "pending" as const,
      title: "Verification under review",
      detail: "Your latest driver documents are awaiting NexRide review.",
    };
  }
  if (profile.reviewStatus === "rejected") {
    return {
      tone: "rejected" as const,
      title: "Documents need attention",
      detail: profile.rejectionReason || "One or more verification documents need to be replaced.",
    };
  }
  if (profile.reviewStatus === "suspended") {
    return {
      tone: "restricted" as const,
      title: "Driver access suspended",
      detail: "Verification changes are restricted until NexRide restores access.",
    };
  }
  return {
    tone: "pending" as const,
    title: "Complete verification",
    detail: "Upload the required driver and vehicle documents to continue onboarding.",
  };
}

export function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "DR";
}

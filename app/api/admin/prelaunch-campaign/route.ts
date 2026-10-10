import { NextRequest, NextResponse } from "next/server";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { PRELAUNCH_BODY, PRELAUNCH_CAMPAIGN_ID, PRELAUNCH_SUBJECT, prelaunchHtml } from "../../../../lib/nexride-prelaunch-campaign";

export const dynamic = "force-dynamic";

async function authorized(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;
  const db = serverAdminSupabase();
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) return false;
  const { data: profile } = await db.from("profiles").select("role,account_status").eq("id", auth.user.id).maybeSingle();
  return profile?.role === "admin" && profile.account_status === "active";
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    return NextResponse.json({
      id: PRELAUNCH_CAMPAIGN_ID,
      subject: PRELAUNCH_SUBJECT,
      body: PRELAUNCH_BODY,
      html: prelaunchHtml(),
      status: "draft",
      sendEnabled: false,
      recipients: null,
      message: "Preview-only. Recipient eligibility, provider integration, suppression, and delivery tracking must be configured before sending."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Campaign preview unavailable" }, { status: 503 });
  }
}

// No live sending is exposed until provider, consent, deduplication and durable campaign ledger are verified.
export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    return NextResponse.json({ error: "Campaign sending is disabled pending delivery-provider and database integration." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Campaign service unavailable" }, { status: 503 });
  }
}

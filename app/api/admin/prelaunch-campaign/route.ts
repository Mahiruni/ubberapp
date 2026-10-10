import { NextRequest, NextResponse } from "next/server";
import { sendSmtpTest } from "../../../../lib/nexride-smtp-test";
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
      testEnabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM),
      recipients: null,
      message: "Send a test email to your administrator address first. Bulk delivery remains disabled until consent and tracking are implemented."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Campaign preview unavailable" }, { status: 503 });
  }
}

// Test delivery is restricted to the authenticated administrator's own email.
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const db = serverAdminSupabase();
    const { data: auth } = await db.auth.getUser(token);
    const email = auth.user?.email;
    if (!email) return NextResponse.json({ error: "Administrator email unavailable" }, { status: 400 });
    const input = await req.json().catch(() => null);
    if (input?.action !== "test" || input?.confirm !== true) return NextResponse.json({ error: "Only confirmed test delivery is supported" }, { status: 400 });
    await sendSmtpTest(email, "[TEST] " + PRELAUNCH_SUBJECT, PRELAUNCH_BODY + "\n\nThis is a test email. The campaign has not been sent to users.");
    return NextResponse.json({ success: true, message: "SMTP accepted the test email for delivery to your administrator inbox." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("NexRide campaign SMTP test failed", error instanceof Error ? error.message.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[email]") : "Unknown error");
    return NextResponse.json({ error: "Test delivery failed. Check SMTP settings and server logs." }, { status: 502 });
  }
}

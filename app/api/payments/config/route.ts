import { paymentConfiguration } from "../../../../lib/nexride-payments";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { requirePayReady, payReply } from "../../../../lib/biloo-pay-server";
export async function GET() {
  let enabled = paymentConfiguration().enabled;
  if (enabled) {
    try {
      await requirePayReady(serverAdminSupabase());
    } catch {
      enabled = false;
    }
  }
  return payReply({
    enabled,
    provider: enabled ? "chapa" : null,
    methods: enabled ? ["cash", "chapa"] : ["cash"],
  });
}

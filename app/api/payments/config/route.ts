import { paymentConfiguration } from "../../../../lib/nexride-payments";

export async function GET() {
  const config = paymentConfiguration();
  return Response.json(
    {
      enabled: config.enabled,
      provider: config.provider,
      methods: config.enabled ? ["cash", "chapa"] : ["cash"],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Integration boundary. Replace only with authenticated, server-priced, idempotent dispatch.
// Existing Supabase admin operations remain independent; this never creates a trip or payment.
export async function POST() {
  return Response.json(
    { status: "unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

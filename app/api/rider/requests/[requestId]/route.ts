// Provider boundary: authenticate ownership, return monotonic booking snapshots, and
// enforce cancellation terms/retry eligibility transactionally before connecting dispatch.
// Never interpret a request receipt as driver acceptance or invent cancellation fees.
const unavailable = () => Response.json({ status: 'unavailable' }, {
  status: 503, headers: { 'Cache-Control': 'no-store' },
});
export async function GET() { return unavailable(); }
export async function POST() { return unavailable(); }

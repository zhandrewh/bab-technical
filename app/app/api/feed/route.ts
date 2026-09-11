import { getAllEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

// ?limit= trims the payload for small feeds; ?claimId= scopes it to one claim. Every open tab polls this, so let the
// CDN answer repeat polls within a block instead of each one reaching the RPC.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const limit = Math.min(200, Math.max(1, Number(q.get("limit")) || 200));
  const claimId = q.get("claimId");
  try {
    const all = await getAllEvents();
    const events = claimId ? all.filter((e) => e.claimId === claimId) : all;
    return Response.json({ events: events.slice(-limit).reverse() }, { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=10" } });
  } catch (e) {
    return Response.json({ events: [], error: (e as Error).message }, { status: 200 });
  }
}

import { getAllEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getAllEvents();
    return Response.json({ events: events.slice(-200).reverse() });
  } catch (e) {
    return Response.json({ events: [], error: (e as Error).message }, { status: 200 });
  }
}

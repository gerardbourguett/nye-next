import { NextResponse } from "next/server";
import { parseSimulation } from "@/lib/relay-clock";
import { publicSchedule } from "@/lib/streams/server";

export const dynamic = "force-dynamic";

/**
 * `?slot=<uuid>` adds that published slot (a relay deep link) wherever it falls.
 * `?at=<ISO>` reads the schedule as of a simulated instant (a preview).
 */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  const params = new URL(request.url).searchParams;
  const slot = params.get("slot") ?? undefined;
  const at = parseSimulation(params.get("at") ?? undefined, undefined)?.at;
  try { return NextResponse.json(await publicSchedule(slot, at), { headers }); }
  catch { return NextResponse.json({ error: "Schedule unavailable. Please try again shortly." }, { status: 503, headers }); }
}

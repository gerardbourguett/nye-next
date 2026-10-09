import { NextResponse } from "next/server";
import { parseSimulation } from "@/lib/relay-clock";
import { publicSchedule } from "@/lib/streams/server";

export const dynamic = "force-dynamic";

// Every viewer polls this every 30 seconds, and the answer is the same for all of them, so the
// CDN may share it for a few seconds: at New Year that turns thousands of database reads into a
// handful. Browsers never keep it (`no-store`); the CDN is addressed with its own targeted headers,
// which take precedence over `Cache-Control` for it (Vercel's own first, then the standard one).
// `Age` tells the room how old a shared answer is (see ageSeconds in domain.ts).
const SHARED = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "public, max-age=5, stale-while-revalidate=10",
  "Vercel-CDN-Cache-Control": "public, max-age=5, stale-while-revalidate=10",
};
const PRIVATE = { "Cache-Control": "no-store, max-age=0" };

/**
 * `?slot=<uuid>` adds that published slot (a relay deep link) wherever it falls.
 * `?at=<ISO>` reads the schedule as of a simulated instant (a preview).
 * Only the plain request is shared; the other two vary per viewer, so they are never cached.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slot = params.get("slot") ?? undefined;
  const at = parseSimulation(params.get("at") ?? undefined, undefined)?.at;
  const plain = slot === undefined && at === undefined && ![...params.keys()].length;
  try { return NextResponse.json(await publicSchedule(slot, at), { headers: plain ? SHARED : PRIVATE }); }
  catch { return NextResponse.json({ error: "Schedule unavailable. Please try again shortly." }, { status: 503, headers: PRIVATE }); }
}

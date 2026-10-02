import { NextResponse } from "next/server";
import { publicSchedule } from "@/lib/streams/server";

export const dynamic = "force-dynamic";

/** `?slot=<uuid>` adds that published slot (a relay deep link) wherever it falls. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  const slot = new URL(request.url).searchParams.get("slot") ?? undefined;
  try { return NextResponse.json(await publicSchedule(slot), { headers }); }
  catch { return NextResponse.json({ error: "Schedule unavailable. Please try again shortly." }, { status: 503, headers }); }
}

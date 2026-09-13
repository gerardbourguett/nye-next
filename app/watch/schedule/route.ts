import { NextResponse } from "next/server";
import { publicSchedule } from "@/lib/streams/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  try { return NextResponse.json(await publicSchedule(), { headers }); }
  catch { return NextResponse.json({ error: "Schedule unavailable. Please try again shortly." }, { status: 503, headers }); }
}

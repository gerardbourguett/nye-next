import { NextResponse } from "next/server";

import { assessHealth, type ScheduleState } from "@/lib/health";
import { supabaseConfig } from "@/lib/supabase/config";
import { publicSchedule } from "@/lib/streams/server";
import { catalogCheckedAt } from "@/lib/timezones/server";

export const dynamic = "force-dynamic";

/**
 * For uptime monitors: 503 only when the schedule cannot be read (the room is
 * broken); 200 with `degraded` when something needs attention but the site
 * works. No secrets and no schedule content, so it is safe to leave public.
 */
export async function GET() {
  const configured = supabaseConfig() !== null;
  let schedule: ScheduleState = "unconfigured";
  if (configured) {
    try {
      await Promise.race([publicSchedule(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6_000))]);
      schedule = "ok";
    } catch {
      schedule = "unavailable";
    }
  }
  const health = assessHealth({ schedule, configured, catalogCheckedAt: configured ? await catalogCheckedAt() : null, now: Date.now() });
  return NextResponse.json(health, { status: health.status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}

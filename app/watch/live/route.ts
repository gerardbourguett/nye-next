import { NextResponse } from "next/server";
import { MAIN_CHANNEL, optionKey, type StreamOption } from "@/lib/streams/domain";
import { liveStatus } from "@/lib/streams/live";
import { publicSchedule } from "@/lib/streams/server";

export const dynamic = "force-dynamic";

const MAX_KEYS = 24;
const SCHEDULE_TTL = 30_000;

// Only streams the published schedule names (plus the broadcast's own
// channel) may reach a provider, so arbitrary IDs cannot spend API quota.
let scheduled: { options: Map<string, StreamOption>; expires: number } | null = null;
async function scheduledOptions() {
  if (!scheduled || scheduled.expires <= Date.now()) {
    const options = new Map<string, StreamOption>();
    const main: StreamOption = { provider: "twitch", id: MAIN_CHANNEL, label: MAIN_CHANNEL };
    options.set(optionKey(main), main);
    try {
      for (const slot of (await publicSchedule()).slots) for (const option of slot.options) options.set(optionKey(option), option);
    } catch { /* main channel only until the schedule can be read */ }
    scheduled = { options, expires: Date.now() + SCHEDULE_TTL };
  }
  return scheduled.options;
}

/**
 * `?keys=twitch:a,youtube:b` → confirmed provider status for those of them
 * that the published schedule names; other keys are ignored.
 * Status is the same for every visitor, so the CDN may share it briefly;
 * `providers` tells the room which providers can confirm anything at all.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("keys") ?? "";
  const keys = [...new Set(raw.split(",").filter(Boolean))].slice(0, MAX_KEYS);
  const allowed = await scheduledOptions();
  const options = keys.flatMap((key) => allowed.get(key) ?? []);
  const providers = {
    twitch: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
  };
  return NextResponse.json({ live: await liveStatus(options), providers }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
  });
}

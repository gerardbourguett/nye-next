import { NextResponse } from "next/server";
import { validProviderId, type Provider, type StreamOption } from "@/lib/streams/domain";
import { liveStatus } from "@/lib/streams/live";

export const dynamic = "force-dynamic";

const MAX_KEYS = 24;

/**
 * `?keys=twitch:a,youtube:b` → confirmed provider status for those streams.
 * Status is the same for every visitor, so the CDN may share it briefly;
 * `providers` tells the room which providers can confirm anything at all.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("keys") ?? "";
  const keys = [...new Set(raw.split(",").filter(Boolean))].slice(0, MAX_KEYS);
  const options: StreamOption[] = [];
  for (const key of keys) {
    const split = key.indexOf(":");
    const provider = key.slice(0, split) as Provider;
    const id = key.slice(split + 1);
    if (split > 0 && validProviderId(provider, id)) options.push({ provider, id, label: id });
  }
  const providers = {
    twitch: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
  };
  return NextResponse.json({ live: await liveStatus(options), providers }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
  });
}

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/supabase/server";
import { supabaseConfig, uncachedFetch } from "@/lib/supabase/config";
import { authorizeAdmin } from "./authorization";
import { decodeSlots, HOUR_MS, MIN_SLOT_MS } from "./domain";
import { editionStreamWindow } from "./relay-link";

export const SLOT_FIELDS = "id,title,starts_at,ends_at,published,options";

export async function adminAccess() {
  const client = await createAuthClient();
  if (!client) return { status: "setup" as const, client: null };
  const status = await authorizeAdmin(async () => {
    const { data, error } = await client.auth.getUser();
    return { userId: data.user?.id ?? null, error: Boolean(error) };
  }, async (userId) => {
    const { data, error } = await client.from("stream_admins").select("user_id").eq("user_id", userId).maybeSingle();
    return { userId: data?.user_id ?? null, error: Boolean(error) };
  });
  return { status, client };
}

// Never carry a visitor's admin cookies into public schedule queries.
function publicClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Schedule unavailable.");
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: uncachedFetch },
  });
}

export async function publicSchedule() {
  const client = publicClient();
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  // Current and upcoming slots in start order, so the 400-row cap can only
  // drop the far end of the 14-day window, never the hours on screen; a slot
  // missing from it stays requestable (the room keeps deep links until seen).
  // The latest slot ended in the past day is read apart, only to tell
  // "the published schedule has ended" from "nothing published yet".
  const [upcoming, ended] = await Promise.all([
    client.from("stream_slots").select(SLOT_FIELDS).eq("published", true)
      .gt("ends_at", iso(now)).lte("starts_at", iso(now + 14 * 24 * HOUR_MS))
      .order("starts_at").limit(400),
    client.from("stream_slots").select(SLOT_FIELDS).eq("published", true)
      .lte("ends_at", iso(now)).gt("ends_at", iso(now - 24 * HOUR_MS))
      .order("ends_at", { ascending: false }).limit(1),
  ]);
  if (upcoming.error || ended.error) throw new Error("Schedule unavailable.");
  return { slots: [...decodeSlots(ended.data), ...decodeSlots(upcoming.data)], serverNow: Date.now() };
}

const PAGE = 500;

/**
 * Published slots overlapping the midnight wave into `year`, paged so even
 * a window of five-minute slots (over 1,000 rows, above PostgREST's default
 * row cap) is read whole. Bounded like the catalog read: the relay never
 * waits long on programming.
 */
export async function relaySchedule(year: number) {
  const { from, to } = editionStreamWindow(year);
  const signal = AbortSignal.timeout(4_000);
  const maxRows = Math.ceil((to - from) / MIN_SLOT_MS) + 1;
  const rows: unknown[] = [];
  for (let offset = 0; offset < maxRows; offset += PAGE) {
    const { data, error } = await publicClient().from("stream_slots").select(SLOT_FIELDS).eq("published", true)
      .gt("ends_at", new Date(from).toISOString())
      .lt("starts_at", new Date(to).toISOString())
      .order("starts_at").order("id")
      .range(offset, offset + PAGE - 1)
      .abortSignal(signal);
    if (error || !data) throw new Error("Schedule unavailable.");
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return decodeSlots(rows);
}

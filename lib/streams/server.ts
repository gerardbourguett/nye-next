import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/supabase/server";
import { supabaseConfig, uncachedFetch } from "@/lib/supabase/config";
import { authorizeAdmin } from "./authorization";
import { decodeSlots, HOUR_MS, MIN_SLOT_MS, UUID, type Slot } from "./domain";
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

export async function publicSchedule(requestedSlotId?: string) {
  const client = publicClient();
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  // Current and upcoming slots in start order. The room shows the current
  // slot and the next 12, so the 400-row cap can only trim slots it never
  // lists; paging all 14 days of five-minute slots (~4,000 rows) on every
  // 30-second poll would cost every viewer for nothing. A deep-linked slot
  // is read by id instead, wherever it falls. The latest slot ended in the
  // past day is read apart, only to tell "the schedule has ended" from
  // "nothing published yet".
  const requested = requestedSlotId && UUID.test(requestedSlotId)
    ? client.from("stream_slots").select(SLOT_FIELDS).eq("published", true).eq("id", requestedSlotId).limit(1)
    : Promise.resolve({ data: [], error: null });
  const [upcoming, ended, linked] = await Promise.all([
    client.from("stream_slots").select(SLOT_FIELDS).eq("published", true)
      .gt("ends_at", iso(now)).lte("starts_at", iso(now + 14 * 24 * HOUR_MS))
      .order("starts_at").limit(400),
    client.from("stream_slots").select(SLOT_FIELDS).eq("published", true)
      .lte("ends_at", iso(now)).gt("ends_at", iso(now - 24 * HOUR_MS))
      .order("ends_at", { ascending: false }).limit(1),
    requested,
  ]);
  if (upcoming.error || ended.error || linked.error) throw new Error("Schedule unavailable.");
  const slots = [...decodeSlots(ended.data), ...decodeSlots(upcoming.data)];
  for (const slot of decodeSlots(linked.data)) if (!slots.some((item) => item.id === slot.id)) slots.push(slot);
  return { slots, serverNow: Date.now() };
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
  const maxPages = Math.ceil((to - from) / MIN_SLOT_MS / PAGE) + 1;
  const slots: Slot[] = [];
  // Keyset pages: published slots cannot overlap, so a start instant names
  // one slot, and each page resumes after the last start read. Unlike
  // offsets, an edit between pages cannot shift rows into a skip or repeat.
  let after: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    let query = publicClient().from("stream_slots").select(SLOT_FIELDS).eq("published", true)
      .gt("ends_at", new Date(from).toISOString())
      .lt("starts_at", new Date(to).toISOString());
    if (after) query = query.gt("starts_at", after);
    const { data, error } = await query.order("starts_at").limit(PAGE).abortSignal(signal);
    if (error || !data) throw new Error("Schedule unavailable.");
    const decoded = decodeSlots(data);
    slots.push(...decoded);
    if (decoded.length < PAGE) break;
    after = decoded[decoded.length - 1].starts_at;
  }
  return slots;
}

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/supabase/server";
import { supabaseConfig, uncachedFetch } from "@/lib/supabase/config";
import { authorizeAdmin } from "./authorization";
import { decodeSlots, HOUR_MS } from "./domain";
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
  const { data, error } = await client.from("stream_slots").select(SLOT_FIELDS).eq("published", true)
    .gt("ends_at", new Date(now - 24 * HOUR_MS).toISOString())
    .lte("starts_at", new Date(now + 14 * 24 * HOUR_MS).toISOString())
    .order("starts_at").limit(400);
  if (error) throw new Error("Schedule unavailable.");
  return { slots: decodeSlots(data), serverNow: Date.now() };
}

/** Published slots overlapping the midnight wave into `year`. */
export async function relaySchedule(year: number) {
  const { from, to } = editionStreamWindow(year);
  const { data, error } = await publicClient().from("stream_slots").select(SLOT_FIELDS).eq("published", true)
    .gt("ends_at", new Date(from).toISOString())
    .lt("starts_at", new Date(to).toISOString())
    .order("starts_at").limit(200)
    // Bounded like the catalog read: the relay never waits long on programming.
    .abortSignal(AbortSignal.timeout(4_000));
  if (error) throw new Error("Schedule unavailable.");
  return decodeSlots(data);
}

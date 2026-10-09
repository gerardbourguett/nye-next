// Programming the end-to-end suite serves from its stand-in Supabase. Every
// label says it is test data, and times are relative to when the mock starts
// so the suite never depends on the calendar.
import { resolveRolloverArrival } from "../data/relay";
import { editionYear } from "../lib/edition";

export const MOCK_PORT = 54329;
export const APP_PORT = 3100;

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

export const IDS = {
  now: "11111111-1111-4111-8111-000000000001",
  next: "11111111-1111-4111-8111-000000000002",
  crossing: "11111111-1111-4111-8111-000000000003",
} as const;

export const STREAMS = {
  studio: { provider: "twitch", id: "studio_cam", label: "Studio camera (test)" },
  harbour: { provider: "youtube_channel", id: "UCabcdefghijklmnopqrstuv", label: "Harbour view (test)", zone: "Australia/Sydney" },
  sydney: { provider: "youtube", id: "5uZa3-RMFos", label: "Sydney fireworks (test)", zone: "Australia/Sydney" },
  main: { provider: "twitch", id: "vanderfondi", label: "vanderfondi (test)" },
  // `.test` never resolves, so the server's status check for these fails fast and offline.
  direct: { provider: "hls", id: "https://streams.example.test/rehearsal/index.m3u8", label: "Direct feed (test)" },
  page: { provider: "link", id: "https://tv.example.test/live", label: "Broadcaster page (test)" },
} as const;

/**
 * The edition whose Sydney crossing slot is still ahead, so the relay link
 * test holds even when the suite runs during the wave itself.
 */
export function crossingYear(now: number) {
  const year = editionYear(now);
  return resolveRolloverArrival("Australia/Sydney", year).arrivalUtcMs - HOUR > now ? year : year + 1;
}

export function fixtureSlots(now: number) {
  const hour = Math.floor(now / HOUR) * HOUR;
  const sydney = resolveRolloverArrival("Australia/Sydney", crossingYear(now)).arrivalUtcMs;
  return [
    { id: IDS.now, title: "Rehearsal on now (test)", starts_at: iso(hour), ends_at: iso(hour + 2 * HOUR), published: true,
      options: [STREAMS.studio, STREAMS.harbour, STREAMS.direct, STREAMS.page] },
    { id: IDS.next, title: "Coming up next (test)", starts_at: iso(hour + 3 * HOUR), ends_at: iso(hour + 4 * HOUR), published: true,
      options: [STREAMS.main, STREAMS.direct] },
    { id: IDS.crossing, title: "Midnight in Sydney (test)", starts_at: iso(sydney - HOUR / 2), ends_at: iso(sydney + HOUR / 2),
      published: true, options: [STREAMS.sydney] },
    { id: "11111111-1111-4111-8111-000000000009", title: "Draft (test)", starts_at: iso(hour + 5 * HOUR),
      ends_at: iso(hour + 6 * HOUR), published: false, options: [STREAMS.main] },
  ];
}

/** The signed-in administrator the stand-in Supabase recognises. */
export const ADMIN = { id: "22222222-2222-4222-8222-0000000000a1", email: "admin@example.test", token: "e2e-admin-token" } as const;

/**
 * The session cookie `@supabase/ssr` reads: the project's host label names it
 * (`sb-127-auth-token` for 127.0.0.1) and the value is the session as base64url JSON.
 */
export function adminSessionCookie() {
  const session = {
    access_token: ADMIN.token, refresh_token: "e2e-refresh", token_type: "bearer", expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    user: { id: ADMIN.id, aud: "authenticated", role: "authenticated", email: ADMIN.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  return { name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, domain: "127.0.0.1", path: "/" };
}

export function fixtureChanges(now: number) {
  const slot = fixtureSlots(now)[0];
  return [
    { id: 3, changed_at: iso(now - 5 * 60_000), changed_by: ADMIN.id, operation: "update", slot_id: slot.id, before: { ...slot, published: false }, after: slot },
    { id: 2, changed_at: iso(now - 60 * 60_000), changed_by: "33333333-3333-4333-8333-333333333333", operation: "insert", slot_id: slot.id, before: null, after: { ...slot, published: false } },
    { id: 1, changed_at: iso(now - 2 * HOUR), changed_by: null, operation: "delete", slot_id: "44444444-4444-4444-8444-444444444444", before: { ...slot, title: "Removed rehearsal (test)" }, after: null },
  ];
}

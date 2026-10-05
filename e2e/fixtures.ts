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
      options: [STREAMS.main] },
    { id: IDS.crossing, title: "Midnight in Sydney (test)", starts_at: iso(sydney - HOUR / 2), ends_at: iso(sydney + HOUR / 2),
      published: true, options: [STREAMS.sydney] },
    { id: "11111111-1111-4111-8111-000000000009", title: "Draft (test)", starts_at: iso(hour + 5 * HOUR),
      ends_at: iso(hour + 6 * HOUR), published: false, options: [STREAMS.main] },
  ];
}

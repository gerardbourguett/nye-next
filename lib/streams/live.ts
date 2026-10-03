import "server-only";

import { optionKey, type StreamOption } from "./domain";
import { parseChannelFeed, parseTwitchStreams, parseTwitchUsers, parseYouTubeVideos, readHlsPlaylist, readMpd, type LiveInfo } from "./live-parse";
import { fetchPublicText } from "./safe-fetch";

// Provider status is optional: without credentials a provider is simply not
// asked, and the room keeps saying "scheduled", never "live". Results are
// cached per instance so viewers polling the room cannot exhaust API quotas.
const STATUS_TTL = 60_000;
const AVATAR_TTL = 24 * 60 * 60_000;
const TIMEOUT = 4_000;

type Cached<T> = { value: T; expires: number };
const statusCache = new Map<string, Cached<LiveInfo | null>>();
const avatarCache = new Map<string, Cached<string | null>>();
let twitchToken: Cached<string> | null = null;

const fresh = <T>(entry: Cached<T> | undefined | null) => entry && entry.expires > Date.now() ? entry : undefined;
const MAX_ENTRIES = 500;

/** Drop expired entries, then the oldest, so per-instance caches stay bounded. */
function prune<T>(cache: Map<string, Cached<T>>) {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expires <= now) cache.delete(key);
  for (const key of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break;
    cache.delete(key);
  }
}
const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function twitchHeaders() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (!fresh(twitchToken)) {
    const body = new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" });
    const json = await getJson("https://id.twitch.tv/oauth2/token", { method: "POST", body }) as Record<string, unknown>;
    if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") throw new Error("Twitch token");
    // Renew a minute early so a request never carries an expiring token.
    twitchToken = { value: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1_000 };
  }
  return { "Client-Id": id, Authorization: `Bearer ${twitchToken!.value}` };
}

async function twitchStatus(logins: string[]) {
  const result = new Map<string, LiveInfo>();
  const headers = await twitchHeaders();
  if (!headers || !logins.length) return null;
  for (const batch of chunks(logins, 100)) {
    const query = new URLSearchParams(batch.map((login) => ["user_login", login]));
    for (const [login, info] of parseTwitchStreams(await getJson(`https://api.twitch.tv/helix/streams?${query}`, { headers }))) {
      result.set(login, info);
    }
  }
  // Avatars are decoration: a failed lookup must not discard confirmed status.
  const missing = logins.filter((login) => !fresh(avatarCache.get(login)));
  for (const batch of chunks(missing, 100)) {
    try {
      const query = new URLSearchParams(batch.map((login) => ["login", login]));
      const avatars = parseTwitchUsers(await getJson(`https://api.twitch.tv/helix/users?${query}`, { headers }));
      for (const login of batch) avatarCache.set(login, { value: avatars.get(login) ?? null, expires: Date.now() + AVATAR_TTL });
    } catch { /* retried on the next status refresh */ }
  }
  return new Map(logins.map((login) => {
    const avatar = avatarCache.get(login)?.value ?? undefined;
    return [login, { ...(result.get(login) ?? { live: false }), avatar }];
  }));
}

async function youtubeVideos(ids: string[]) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !ids.length) return null;
  const result = new Map<string, LiveInfo>();
  for (const batch of chunks(ids, 50)) {
    const query = new URLSearchParams({ part: "snippet,liveStreamingDetails", id: batch.join(","), key });
    for (const [id, info] of parseYouTubeVideos(await getJson(`https://www.googleapis.com/youtube/v3/videos?${query}`))) {
      result.set(id, info);
    }
  }
  return result;
}

/** A channel's live video: its public feed's recent uploads, checked with one cheap videos.list call. */
async function youtubeChannel(channelId: string): Promise<LiveInfo | null> {
  if (!process.env.YOUTUBE_API_KEY) return null;
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?${new URLSearchParams({ channel_id: channelId })}`,
    { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const videos = await youtubeVideos(parseChannelFeed(await response.text()));
  return [...(videos?.values() ?? [])].find((info) => info.live) ?? { live: false };
}

/**
 * A direct stream's own playlist or manifest. Live means the server answers
 * with a running (not ended) playlist; a 404 or 410 is a confirmed absence.
 * Recordings, errors and anything unreadable stay unconfirmed (null), since
 * a finished playlist can still be watched and a 403 may be an expired token.
 */
async function playlistStatus(option: StreamOption): Promise<LiveInfo | null> {
  let url = option.id;
  for (let hop = 0; hop < 2; hop++) {
    const { status, text } = await fetchPublicText(url, TIMEOUT);
    if (status === 404 || status === 410) return { live: false };
    if (status !== 200) return null;
    const reading = option.provider === "hls" ? readHlsPlaylist(text) : readMpd(text);
    if (reading.state === "live") return { live: true };
    if (reading.state !== "master") return null;
    url = new URL(reading.variant, url).href;
  }
  return null;
}

/**
 * Confirmed status for each option a provider could answer for. Options a
 * provider cannot answer (no credentials, an error) are left out entirely.
 */
export async function liveStatus(options: readonly StreamOption[]): Promise<Record<string, LiveInfo>> {
  prune(statusCache);
  prune(avatarCache);
  const result: Record<string, LiveInfo> = {};
  const pending = options.filter((option) => {
    const cached = fresh(statusCache.get(optionKey(option)));
    if (!cached) return true;
    if (cached.value) result[optionKey(option)] = cached.value;
    return false;
  });
  const remember = (option: StreamOption, info: LiveInfo | null | undefined) => {
    statusCache.set(optionKey(option), { value: info ?? null, expires: Date.now() + STATUS_TTL });
    if (info) result[optionKey(option)] = info;
  };

  const twitch = pending.filter((option) => option.provider === "twitch");
  const videos = pending.filter((option) => option.provider === "youtube");
  const channels = pending.filter((option) => option.provider === "youtube_channel");
  const streams = pending.filter((option) => option.provider === "hls" || option.provider === "dash");
  await Promise.all([
    // An unreachable stream host is remembered as unknown too, so polling cannot hammer it.
    ...streams.map((option) => playlistStatus(option).then(
      (info) => remember(option, info),
      () => remember(option, null))),
    twitchStatus(twitch.map((option) => option.id)).then(
      (found) => found && twitch.forEach((option) => remember(option, found.get(option.id))),
      () => undefined),
    youtubeVideos(videos.map((option) => option.id)).then(
      (found) => found && videos.forEach((option) => remember(option, found.get(option.id) ?? { live: false })),
      () => undefined),
    ...channels.map((option) => youtubeChannel(option.id).then(
      (info) => info && remember(option, info),
      () => undefined)),
  ]);
  return result;
}

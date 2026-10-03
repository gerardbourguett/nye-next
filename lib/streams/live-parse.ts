// Pure readers for provider responses, kept apart from the fetching module so
// they run in offline tests. Anything unexpected is dropped, never guessed.

/** What a provider confirmed about one stream option, keyed by option key. */
export type LiveInfo = {
  live: boolean;
  title?: string;
  viewers?: number;
  startedAt?: string;
  thumbnail?: string;
  /** For a YouTube channel: the video currently live, for chat and thumbnails. */
  videoId?: string;
  avatar?: string;
};

const HTTPS_IMAGE = /^https:\/\/(?:static-cdn\.jtvnw\.net|i\.ytimg\.com|yt3\.ggpht\.com)\//;
const text = (value: unknown, max = 200) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const count = (value: unknown) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};
const instant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
const image = (value: unknown) => typeof value === "string" && HTTPS_IMAGE.test(value) ? value : undefined;
const records = (value: unknown, field: string): Record<string, unknown>[] => {
  if (!value || typeof value !== "object") return [];
  const list = (value as Record<string, unknown>)[field];
  return Array.isArray(list) ? list.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
};

/** Helix `GET /streams`: only live channels are returned, keyed by login. */
export function parseTwitchStreams(json: unknown): Map<string, LiveInfo> {
  const result = new Map<string, LiveInfo>();
  for (const stream of records(json, "data")) {
    const login = text(stream.user_login, 25)?.toLowerCase();
    if (!login || stream.type !== "live") continue;
    const thumbnail = image(typeof stream.thumbnail_url === "string"
      ? stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360") : undefined);
    result.set(login, { live: true, title: text(stream.title), viewers: count(stream.viewer_count),
      startedAt: instant(stream.started_at), thumbnail });
  }
  return result;
}

/** Helix `GET /users`: profile images keyed by login. */
export function parseTwitchUsers(json: unknown): Map<string, string> {
  const result = new Map<string, string>();
  for (const user of records(json, "data")) {
    const login = text(user.login, 25)?.toLowerCase();
    const avatar = image(user.profile_image_url);
    if (login && avatar) result.set(login, avatar);
  }
  return result;
}

/** YouTube Data API `videos.list?part=snippet,liveStreamingDetails`, keyed by video ID. */
export function parseYouTubeVideos(json: unknown): Map<string, LiveInfo> {
  const result = new Map<string, LiveInfo>();
  for (const video of records(json, "items")) {
    const id = typeof video.id === "string" && /^[A-Za-z0-9_-]{11}$/.test(video.id) ? video.id : undefined;
    const snippet = (video.snippet ?? {}) as Record<string, unknown>;
    const details = (video.liveStreamingDetails ?? {}) as Record<string, unknown>;
    if (!id) continue;
    const live = snippet.liveBroadcastContent === "live";
    result.set(id, {
      live,
      title: text(snippet.title),
      viewers: live ? count(details.concurrentViewers) : undefined,
      startedAt: live ? instant(details.actualStartTime) : undefined,
      thumbnail: `https://i.ytimg.com/vi/${id}/${live ? "hqdefault_live" : "hqdefault"}.jpg`,
      videoId: id,
    });
  }
  return result;
}

/** A channel's public uploads feed (`/feeds/videos.xml?channel_id=`): recent video IDs, newest first. */
export function parseChannelFeed(xml: string): string[] {
  const ids: string[] = [];
  for (const match of xml.matchAll(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/g)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids.slice(0, 15);
}

/** What a stream's own playlist says: running now, finished, or not a playlist at all. */
export type PlaylistReading = { state: "live" | "ended" | "invalid" } | { state: "master"; variant: string };

/**
 * An HLS playlist. A media playlist is live until it carries `#EXT-X-ENDLIST`
 * (or declares itself VOD); a master playlist only lists variants, so it
 * returns the first one to be read in turn.
 */
export function readHlsPlaylist(text: string): PlaylistReading {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((line) => line.trim());
  if (lines[0] !== "#EXTM3U") return { state: "invalid" };
  const tag = lines.findIndex((line) => line.startsWith("#EXT-X-STREAM-INF"));
  if (tag >= 0) {
    const variant = lines.slice(tag + 1).find((line) => line && !line.startsWith("#"));
    return variant ? { state: "master", variant } : { state: "invalid" };
  }
  if (!lines.some((line) => line.startsWith("#EXTINF") || line.startsWith("#EXT-X-TARGETDURATION"))) return { state: "invalid" };
  return lines.some((line) => line === "#EXT-X-ENDLIST" || line === "#EXT-X-PLAYLIST-TYPE:VOD")
    ? { state: "ended" } : { state: "live" };
}

/**
 * A DASH manifest: `type="dynamic"` on the document's own MPD element means a
 * live presentation. Comments, CDATA, processing instructions and the DOCTYPE
 * are dropped first and the MPD must be the root, so an example tag inside a
 * comment (or an MPD-like element nested in other XML) is never mistaken for it.
 */
export function readMpd(text: string): { state: "live" | "ended" | "invalid" } {
  const bare = text.replace(/^\uFEFF/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  const root = /^\s*<(?:[A-Za-z0-9_-]+:)?MPD((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(bare);
  if (!root) return { state: "invalid" };
  return /(?:^|\s)type\s*=\s*(["'])dynamic\1/.test(root[1]) ? { state: "live" } : { state: "ended" };
}

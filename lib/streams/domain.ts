import { isSupportedZone, isZoneName } from "../zones";
import { isPublicHttpsUrl } from "./hostname";

/**
 * `youtube` is one video; `youtube_channel` is whatever that channel has live.
 * `hls` (.m3u8) and `dash` (.mpd) are direct streams played in the room, and
 * `link` is any web page, opened in a new tab; their `id` is an HTTPS URL.
 */
export type Provider = "twitch" | "youtube" | "youtube_channel" | "hls" | "dash" | "link";
export const PROVIDERS: readonly Provider[] = ["twitch", "youtube", "youtube_channel", "hls", "dash", "link"];
export type UrlProvider = "hls" | "dash" | "link";
export const isUrlProvider = (provider: unknown): provider is UrlProvider =>
  provider === "hls" || provider === "dash" || provider === "link";
/** `zone` is the IANA zone being celebrated; it ties the stream to a relay crossing. */
export type StreamOption = { provider: Provider; id: string; label: string; zone?: string };
export type Slot = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  published: boolean;
  options: StreamOption[];
};

export const HOUR_MS = 3_600_000;
/** Slots default to one hour but may run 5 minutes to 92 days, e.g. for rehearsals left on air for months. */
export const MIN_SLOT_MS = 5 * 60_000;
export const MAX_SLOT_DAYS = 92;
export const MAX_SLOT_MS = MAX_SLOT_DAYS * 24 * HOUR_MS;
export const SLOT_LENGTHS = `5 minutes to ${MAX_SLOT_DAYS} days`;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TWITCH_ID = /^[a-z0-9_]{1,25}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];

/** Stream URLs are keys in `?keys=` lists and deep links, so they stay short and free of separators. */
export const MAX_STREAM_URL = 400;
const URL_CHARS = /^https:\/\/[^\s,"'<>\\`#]+$/;
const URL_EXTENSION: Record<UrlProvider, RegExp | null> = { hls: /\.m3u8$/i, dash: /\.mpd$/i, link: null };
const URL_HELP: Record<UrlProvider, string> = {
  hls: "Enter an HTTPS URL ending in .m3u8, on a public ASCII host name (no IP addresses, xn-- names, spaces or commas).",
  dash: "Enter an HTTPS URL ending in .mpd, on a public ASCII host name (no IP addresses, xn-- names, spaces or commas).",
  link: "Enter an HTTPS URL on a public ASCII host name (no IP addresses, xn-- names, spaces or commas).",
};

/**
 * The canonical form of a stream URL, or null. Only HTTPS, no credentials,
 * a public host name, a port of 1024 or above (or none), and for `hls`/`dash`
 * the matching file extension; the fragment is dropped.
 */
function parseStreamUrl(provider: UrlProvider, input: string): URL | null {
  if (input.length > MAX_STREAM_URL || !URL_CHARS.test(input)) return null;
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  // A trailing dot names the same host but is refused so the SQL backstop and this check agree.
  if (url.hash || url.hostname.endsWith(".") || !isPublicHttpsUrl(url)) return null;
  const extension = URL_EXTENSION[provider];
  if (extension && !extension.test(url.pathname)) return null;
  return url;
}

/** The form to store, as this runtime's URL parser writes it, or null when the rules refuse the address. */
export function normalizeStreamUrl(provider: UrlProvider, input: string): string | null {
  const url = parseStreamUrl(provider, input);
  return url && url.href.length <= MAX_STREAM_URL ? url.href : null;
}

/**
 * Whether a stored ID obeys the rules. Deliberately not "equals what the
 * parser would write": engines differ on how they serialize characters such
 * as ^ (Node 22 keeps it in a path, Node 24 writes %5E) and browsers differ
 * too, so a byte-for-byte test would let a row the server saved fail to read
 * back somewhere and take the whole schedule with it.
 */
export function isStreamUrl(provider: UrlProvider, id: string): boolean {
  return parseStreamUrl(provider, id) !== null;
}

const queryLength = (text: string) => new URLSearchParams({ k: text }).toString().length - 2;

/**
 * Status-request keys in priority order, capped by count and by their
 * percent-encoded length in the query string (what a server's request-line
 * limit sees). A key too long for what is left is skipped; later ones may fit.
 */
export function capLiveKeys(keys: Iterable<string>, maxKeys = 24, maxEncoded = 6_000): string[] {
  const kept: string[] = [];
  let size = 0;
  for (const key of keys) {
    const cost = queryLength(key) + 3; // the encoded comma between keys
    if (kept.length >= maxKeys) break;
    if (size + cost > maxEncoded) continue;
    kept.push(key);
    size += cost;
  }
  return kept;
}

export function validProviderId(provider: unknown, id: unknown): boolean {
  if (typeof id !== "string") return false;
  if (provider === "twitch") return TWITCH_ID.test(id);
  if (provider === "youtube") return YOUTUBE_ID.test(id);
  if (isUrlProvider(provider)) return isStreamUrl(provider, id);
  return provider === "youtube_channel" && YOUTUBE_CHANNEL_ID.test(id);
}

export function providerName(provider: Provider) {
  switch (provider) {
    case "twitch": return "Twitch";
    case "hls": return "HLS";
    case "dash": return "DASH";
    case "link": return "Web";
    default: return "YouTube";
  }
}

/** The host a URL-based option points at, for labels and consent notices. */
export function streamHost(option: StreamOption): string | null {
  if (!isUrlProvider(option.provider)) return null;
  try { return new URL(option.id).hostname; } catch { return null; }
}

/** Accept only canonical providers, never an arbitrary player URL or HTML. */
export function parseStreamSource(provider: Provider, input: string): string {
  const source = input.trim();
  if (isUrlProvider(provider)) {
    const url = normalizeStreamUrl(provider, source);
    if (!url) throw new Error(URL_HELP[provider]);
    return url;
  }
  let id = source;
  if (source.includes(":") || source.includes("/")) {
    let url: URL;
    try { url = new URL(source); } catch { throw new Error("Use an HTTPS provider URL or an ID."); }
    if (url.protocol !== "https:" || url.username || url.password || url.port || /[\\\s]/.test(source)) {
      throw new Error("Use an HTTPS provider URL without credentials or a port.");
    }
    if (provider === "twitch" && ["twitch.tv", "www.twitch.tv"].includes(url.hostname)) {
      id = /^\/([A-Za-z0-9_]{1,25})\/?$/.exec(url.pathname)?.[1] ?? "";
    } else if (provider === "youtube" && url.hostname === "youtu.be") {
      id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? "";
    } else if (provider === "youtube" && YOUTUBE_HOSTS.includes(url.hostname)) {
      id = url.pathname === "/watch" && url.searchParams.getAll("v").length === 1
        ? url.searchParams.get("v") ?? ""
        : /^\/(?:live|shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? "";
    } else if (provider === "youtube_channel" && YOUTUBE_HOSTS.includes(url.hostname)) {
      id = url.pathname === "/embed/live_stream" && url.searchParams.getAll("channel").length === 1
        ? url.searchParams.get("channel") ?? ""
        : /^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/(?:live|streams|featured))?\/?$/.exec(url.pathname)?.[1] ?? "";
    } else {
      throw new Error("The URL must belong to the selected provider.");
    }
  }
  if (provider === "twitch") id = id.toLowerCase();
  if (!validProviderId(provider, id)) {
    throw new Error(provider === "twitch"
      ? "Enter a Twitch channel: 1–25 letters, numbers, or underscores."
      : provider === "youtube"
        ? "Enter a YouTube video URL or its 11-character video ID, not a channel or playlist."
        : "Enter a YouTube channel URL with /channel/UC… or its channel ID. @handles cannot be verified; use Share channel → Copy channel ID.");
  }
  return id;
}

/** Optional place for a stream: empty means none; otherwise a zone this runtime supports. */
export function parseZone(input: string): string | undefined {
  const zone = input.trim();
  if (!zone) return undefined;
  if (!isZoneName(zone) || !isSupportedZone(zone)) {
    throw new Error("Choose the place from the timezone list, like America/Santiago, or leave it empty.");
  }
  return zone;
}

export function validateOptions(value: unknown): StreamOption[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new Error("Each slot needs 1–4 stream options.");
  }
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid stream option.");
    const option = item as Record<string, unknown>;
    const keys = Object.keys(option).sort().join(",");
    if ((keys !== "id,label,provider" && keys !== "id,label,provider,zone") ||
        !validProviderId(option.provider, option.id) || typeof option.label !== "string" ||
        !option.label.trim() || option.label.length > 120 || option.label !== option.label.trim() ||
        ("zone" in option && !isZoneName(option.zone))) {
      throw new Error("Each option needs a valid provider ID, a label of 1–120 characters, and an optional IANA place.");
    }
    const key = `${option.provider}:${option.id}`;
    if (seen.has(key)) throw new Error("Choose different streams within a slot.");
    seen.add(key);
    const valid: StreamOption = { provider: option.provider as Provider, id: option.id as string, label: option.label };
    if (typeof option.zone === "string") valid.zone = option.zone;
    return valid;
  });
}

export function validateWindow(start: string, end: string) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  const length = to - from;
  if (!Number.isFinite(from) || !Number.isFinite(to) || length < MIN_SLOT_MS || length > MAX_SLOT_MS ||
      length % 60_000 !== 0 || from < Date.UTC(2000, 0, 1) || to > Date.UTC(2101, 0, 1)) {
    throw new Error(`A slot must last whole minutes from ${SLOT_LENGTHS}, within years 2000–2100.`);
  }
}

/** "1 h", "45 min", "2 h 30 min", "3 d 4 h". */
export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  const parts: string[] = [];
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (minutes % 60) parts.push(`${minutes % 60} min`);
  return parts.join(" ") || "0 min";
}

export function overlaps(a: Pick<Slot, "starts_at" | "ends_at">, b: Pick<Slot, "starts_at" | "ends_at">) {
  return Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
}

export function activeSlot(slots: Slot[], now: number): Slot | undefined {
  return slots.find((slot) => slot.published && Date.parse(slot.starts_at) <= now && now < Date.parse(slot.ends_at));
}

export function optionKey(option: StreamOption) { return `${option.provider}:${option.id}`; }

/** A deep link's `?slot=&stream=` pair, or null unless both are well formed. */
export function parseSelection(slotId: unknown, key: unknown): { slotId: string; key: string } | null {
  if (typeof slotId !== "string" || !UUID.test(slotId) || typeof key !== "string") return null;
  const split = key.indexOf(":");
  const provider = key.slice(0, split);
  return split > 0 && validProviderId(provider, key.slice(split + 1)) ? { slotId, key } : null;
}

export function selectedOption(slot: Slot | undefined, selection: { slotId: string; key: string } | null) {
  if (!slot) return undefined;
  return (selection?.slotId === slot.id ? slot.options.find((option) => optionKey(option) === selection.key) : undefined)
    ?? slot.options[0];
}

export type PlaybackState = {
  selection: { slotId: string; key: string } | null;
  loadedPlayer: string | null;
};

/** Forget invalid choices and load consent; later availability cannot restore them. */
export function reconcilePlayback(state: PlaybackState, slot: Slot | undefined, canEmbed: boolean): PlaybackState {
  const selection = slot && state.selection?.slotId === slot.id &&
    slot.options.some((option) => optionKey(option) === state.selection?.key) ? state.selection : null;
  const option = selectedOption(slot, selection);
  const key = slot && option ? `${slot.id}:${optionKey(option)}` : null;
  const loadedPlayer = canEmbed && key === state.loadedPlayer ? key : null;
  return selection === state.selection && loadedPlayer === state.loadedPlayer
    ? state : { selection, loadedPlayer };
}

export function providerUrl(option: StreamOption) {
  if (!validProviderId(option.provider, option.id)) throw new Error("Invalid provider ID.");
  if (isUrlProvider(option.provider)) return option.id;
  if (option.provider === "twitch") return `https://www.twitch.tv/${option.id}`;
  return option.provider === "youtube"
    ? `https://www.youtube.com/watch?v=${option.id}`
    : `https://www.youtube.com/channel/${option.id}/live`;
}

export function embedUrl(option: StreamOption, hostname: string) {
  if (!validProviderId(option.provider, option.id)) throw new Error("Invalid provider ID.");
  if (isUrlProvider(option.provider)) throw new Error("URL streams play in the video player, not an embed.");
  if (option.provider === "youtube") return `https://www.youtube.com/embed/${option.id}?autoplay=0&playsinline=1`;
  if (option.provider === "youtube_channel") {
    return `https://www.youtube.com/embed/live_stream?${new URLSearchParams({ channel: option.id, autoplay: "0", playsinline: "1" })}`;
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) throw new Error("Unsupported Twitch parent hostname.");
  return `https://player.twitch.tv/?${new URLSearchParams({ channel: option.id, parent: hostname, autoplay: "false" })}`;
}

/** The broadcast's own Twitch channel (PRODUCT.md): its chat is always on offer. */
export const MAIN_CHANNEL = "vanderfondi";

const HOSTNAME = /^[a-zA-Z0-9.-]+$/;

/** Twitch's embeddable chat, which like its player needs HTTPS and a declared parent. */
export function twitchChatUrl(channel: string, hostname: string, dark: boolean) {
  if (!validProviderId("twitch", channel) || !HOSTNAME.test(hostname)) throw new Error("Unsupported Twitch chat.");
  const query = new URLSearchParams({ parent: hostname });
  if (dark) query.set("darkpopout", "");
  return `https://www.twitch.tv/embed/${channel}/chat?${query}`;
}

/** YouTube's live chat for one live video; YouTube shows its own message once the stream ends. */
export function youtubeChatUrl(videoId: string, hostname: string) {
  if (!validProviderId("youtube", videoId) || !HOSTNAME.test(hostname)) throw new Error("Unsupported YouTube chat.");
  return `https://www.youtube.com/live_chat?${new URLSearchParams({ v: videoId, embed_domain: hostname })}`;
}

export function decodeSlots(value: unknown): Slot[] {
  if (!Array.isArray(value)) throw new Error("Invalid schedule.");
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new Error("Invalid schedule.");
    const slot = row as Slot;
    if (typeof slot.id !== "string" || !UUID.test(slot.id) || typeof slot.title !== "string" ||
        !slot.title.trim() || slot.title.length > 120 || typeof slot.published !== "boolean" ||
        typeof slot.starts_at !== "string" || typeof slot.ends_at !== "string") throw new Error("Invalid schedule.");
    validateWindow(slot.starts_at, slot.ends_at);
    return { id: slot.id, title: slot.title, starts_at: slot.starts_at, ends_at: slot.ends_at,
      published: slot.published, options: validateOptions(slot.options) };
  });
}

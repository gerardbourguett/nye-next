import { isSupportedZone, isZoneName } from "../zones";

/** `youtube` is one video; `youtube_channel` is whatever that channel has live. */
export type Provider = "twitch" | "youtube" | "youtube_channel";
export const PROVIDERS: readonly Provider[] = ["twitch", "youtube", "youtube_channel"];
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
/** Slots default to one hour but may run 5 minutes to 7 days, e.g. for rehearsals. */
export const MIN_SLOT_MS = 5 * 60_000;
export const MAX_SLOT_MS = 7 * 24 * HOUR_MS;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TWITCH_ID = /^[a-z0-9_]{1,25}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];

export function validProviderId(provider: unknown, id: unknown): boolean {
  if (typeof id !== "string") return false;
  if (provider === "twitch") return TWITCH_ID.test(id);
  if (provider === "youtube") return YOUTUBE_ID.test(id);
  return provider === "youtube_channel" && YOUTUBE_CHANNEL_ID.test(id);
}

export function providerName(provider: Provider) {
  return provider === "twitch" ? "Twitch" : "YouTube";
}

/** Accept only canonical providers, never an arbitrary player URL or HTML. */
export function parseStreamSource(provider: Provider, input: string): string {
  const source = input.trim();
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
    throw new Error("A slot must last whole minutes from 5 minutes to 7 days, within years 2000–2100.");
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
  if (option.provider === "twitch") return `https://www.twitch.tv/${option.id}`;
  return option.provider === "youtube"
    ? `https://www.youtube.com/watch?v=${option.id}`
    : `https://www.youtube.com/channel/${option.id}/live`;
}

export function embedUrl(option: StreamOption, hostname: string) {
  if (!validProviderId(option.provider, option.id)) throw new Error("Invalid provider ID.");
  if (option.provider === "youtube") return `https://www.youtube.com/embed/${option.id}?autoplay=0&playsinline=1`;
  if (option.provider === "youtube_channel") {
    return `https://www.youtube.com/embed/live_stream?${new URLSearchParams({ channel: option.id, autoplay: "0", playsinline: "1" })}`;
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) throw new Error("Unsupported Twitch parent hostname.");
  return `https://player.twitch.tv/?${new URLSearchParams({ channel: option.id, parent: hostname, autoplay: "false" })}`;
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

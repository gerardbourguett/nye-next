import { MAX_STREAM_URL, normalizeStreamUrl, type UrlProvider } from "./domain";

/** One entry of an IPTV-style `.m3u` list, with what the room could do with it. */
export type ListedChannel = {
  name: string;
  /** The URL as listed, resolved against the list's own address when relative. */
  url: string;
  group?: string;
  /** How it would be stored, or null when the room cannot use it. */
  provider: UrlProvider | null;
  /** Why it cannot be used, or a caution for a usable entry. */
  note?: string;
};

export type ParsedList = {
  channels: ListedChannel[];
  /** True when the text is itself an HLS playlist (a stream), not a list of channels. */
  isStream: boolean;
};

export const MAX_LISTED_CHANNELS = 1_000;
const ATTRIBUTE = /([A-Za-z0-9_-]+)="([^"]*)"/g;
const STREAM_TAGS = /^#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE|PLAYLIST-TYPE|ENDLIST)/m;

function classify(raw: string): Pick<ListedChannel, "provider" | "note"> {
  if (/^http:\/\//i.test(raw)) {
    return { provider: null, note: "Plain HTTP cannot play on an HTTPS site; the host would need HTTPS." };
  }
  if (!/^https:\/\//i.test(raw)) return { provider: null, note: "Not an HTTPS address." };
  if (raw.length > MAX_STREAM_URL) return { provider: null, note: `Longer than ${MAX_STREAM_URL} characters.` };
  for (const provider of ["hls", "dash"] as const) {
    if (normalizeStreamUrl(provider, raw)) return { provider };
  }
  if (normalizeStreamUrl("link", raw)) {
    return { provider: "link", note: "No .m3u8 or .mpd in the address, so it can only be opened in a new tab." };
  }
  return { provider: null, note: "Not a usable address: it needs a public host name and no spaces, commas or credentials." };
}

/**
 * Reads an extended M3U list: `#EXTINF` lines name each entry (and may carry
 * a `group-title`), the next address line is its stream. Lines
 * it does not understand are skipped; entries repeat-free by address.
 */
export function parseM3u(text: string, base?: string): ParsedList {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((line) => line.trim());
  if (!lines.some((line) => /^#EXT(?:M3U|INF)/i.test(line))) return { channels: [], isStream: false };
  // Segment and variant tags only appear in a stream's own playlist, never in a channel list.
  if (STREAM_TAGS.test(text)) return { channels: [], isStream: true };

  const channels: ListedChannel[] = [];
  const seen = new Set<string>();
  let pending: { name: string; group?: string } | null = null;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const body = line.slice(line.indexOf(":") + 1);
      const attributes = new Map<string, string>();
      for (const match of body.matchAll(ATTRIBUTE)) attributes.set(match[1].toLowerCase(), match[2].trim());
      const title = body.replace(ATTRIBUTE, "");
      const name = title.slice(title.indexOf(",") + 1).trim() || attributes.get("tvg-name") || "";
      pending = { name, group: attributes.get("group-title") || undefined };
      continue;
    }
    if (line.startsWith("#")) continue;
    let url = line;
    if (base) { try { url = new URL(line, base).href; } catch { /* kept as written, then marked unusable */ } }
    if (!seen.has(url)) {
      seen.add(url);
      const name = (pending?.name || url).slice(0, 120);
      channels.push({ name, url, group: pending?.group, ...classify(url) });
    }
    pending = null;
    if (channels.length >= MAX_LISTED_CHANNELS) break;
  }
  return { channels, isStream: false };
}

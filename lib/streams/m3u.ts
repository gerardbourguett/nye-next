import { MAX_STREAM_URL, normalizeStreamUrl, type UrlProvider } from "./domain";

/** One usable entry of an IPTV-style `.m3u` list, with how the room would store it. */
export type ListedChannel = {
  name: string;
  /** The URL as listed, resolved against the list's own address when relative. */
  url: string;
  group?: string;
  provider: UrlProvider;
  /** A caution for a usable entry (for example, that it can only be opened in a new tab). */
  note?: string;
};

export type ParsedList = {
  /** Usable entries only, at most `MAX_LISTED_CHANNELS`. */
  channels: ListedChannel[];
  /** Entries the room cannot use (plain HTTP, IP hosts, unusable addresses); they never count toward the cap. */
  skipped: number;
  /** True when more usable entries followed the cap. */
  truncated: boolean;
  /** True when the text is itself an HLS playlist (a stream), not a list of channels. */
  isStream: boolean;
};

export const MAX_LISTED_CHANNELS = 1_000;
const ATTRIBUTE = /([A-Za-z0-9_-]+)="([^"]*)"/g;
const STREAM_TAGS = /^#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE|PLAYLIST-TYPE|ENDLIST)/m;
const EMPTY: ParsedList = { channels: [], skipped: 0, truncated: false, isStream: false };

/** How an address would be stored, or null when the room cannot use it. */
function classify(raw: string): { provider: UrlProvider; note?: string } | null {
  if (raw.length > MAX_STREAM_URL) return null;
  for (const provider of ["hls", "dash"] as const) {
    if (normalizeStreamUrl(provider, raw)) return { provider };
  }
  if (normalizeStreamUrl("link", raw)) {
    return { provider: "link", note: "No .m3u8 or .mpd in the address, so it can only be opened in a new tab." };
  }
  return null;
}

/**
 * Reads an extended M3U list: `#EXTINF` lines name each entry (and may carry
 * a `group-title`), the next address line is its stream. Lines it does not
 * understand are skipped, addresses are listed once, and only entries the
 * room can use count toward the cap, so a long run of unusable ones (plain
 * HTTP, IP hosts) cannot hide the usable ones after it.
 */
export function parseM3u(text: string, base?: string): ParsedList {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim());
  if (!lines.some((line) => /^#EXT(?:M3U|INF)/i.test(line))) return EMPTY;
  // Segment and variant tags only appear in a stream's own playlist, never in a channel list.
  if (STREAM_TAGS.test(text)) return { ...EMPTY, isStream: true };

  const channels: ListedChannel[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let truncated = false;
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
    if (base) { try { url = new URL(line, base).href; } catch { /* kept as written, then skipped as unusable */ } }
    if (!seen.has(url)) {
      seen.add(url);
      const usable = classify(url);
      if (!usable) skipped++;
      else if (channels.length >= MAX_LISTED_CHANNELS) { truncated = true; break; }
      else channels.push({ name: (pending?.name || url).slice(0, 120), url, group: pending?.group, ...usable });
    }
    pending = null;
  }
  return { channels, skipped, truncated, isStream: false };
}

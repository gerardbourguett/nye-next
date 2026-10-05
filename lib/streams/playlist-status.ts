import type { StreamOption } from "./domain";
import { readHlsPlaylist, readMpd, type LiveInfo } from "./live-parse";

/** Reads one address: the status, the text, and the address it really came from after redirects. */
export type FetchText = (url: string) => Promise<{ status: number; text: string; url: string }>;

/**
 * A direct stream's own playlist or manifest. Live means the server answers
 * with a running (not ended) playlist; a 404 or 410 on the stream's own
 * address is a confirmed absence. A master playlist's first rendition is
 * only a sample, so its failure says nothing about the stream as a whole.
 * Recordings, errors and anything unreadable stay unconfirmed (null), since
 * a finished playlist can still be watched and a 403 may be an expired token.
 * Relative renditions resolve against where the master really came from.
 */
export async function playlistStatus(option: StreamOption, fetchText: FetchText): Promise<LiveInfo | null> {
  let url = option.id;
  for (let hop = 0; hop < 2; hop++) {
    const { status, text, url: finalUrl } = await fetchText(url);
    if (hop === 0 && (status === 404 || status === 410)) return { live: false };
    if (status !== 200) return null;
    const reading = option.provider === "hls" ? readHlsPlaylist(text) : readMpd(text);
    if (reading.state === "live") return { live: true };
    if (reading.state !== "master") return null;
    url = new URL(reading.variant, finalUrl).href;
  }
  return null;
}

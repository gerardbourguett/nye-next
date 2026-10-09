import { ImageResponse } from "next/og";

import { editionTag } from "@/lib/edition";
import { requestEdition } from "@/lib/edition-server";

export const SHARE_ALT = "Midnight is a 26-hour relay: follow New Year across every timezone.";
export const SHARE_SIZE = { width: 1200, height: 630 };

/** A year the image may show: a whole number in the range the site supports (the same as a preview's). */
export function parseShareYear(value: string | null): number | null {
  return value !== null && /^\d{4}$/.test(value) && Number(value) >= 2000 && Number(value) <= 2100 ? Number(value) : null;
}

/**
 * The image shown when a link is shared (Open Graph and Twitter cards). It
 * names the edition in force at request time, or the one asked for (a preview
 * of another edition), and promises nothing else: no lineup, no dates and no
 * audience figures.
 */
export async function shareImage(edition?: number) {
  const tag = editionTag(edition ?? await requestEdition());
  const year = tag.replace(/Live$/, "");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0c0a09", color: "#fafaf9" }}>
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: "#a8a29e" }}>New Year, timezone by timezone</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 220, fontWeight: 700, lineHeight: 1, letterSpacing: -6 }}>
            <span>{year}</span>
            <span style={{ color: "#10b981" }}>Live</span>
          </div>
          <div style={{ display: "flex", fontSize: 44, marginTop: 28, color: "#d6d3d1" }}>Midnight is a 26-hour relay.</div>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#a8a29e" }}>twitch.tv/vanderfondi</div>
      </div>
    ),
    { ...SHARE_SIZE },
  );
}

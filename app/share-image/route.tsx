import { parseShareYear, shareImage } from "@/lib/og-image";

/**
 * The share image for a given edition (`?year=2028`), for previews of an edition other than
 * the real one. The real pages use /opengraph-image and /twitter-image, which follow the clock.
 * The year is bounded, and the image is the same every time for it, so it may be cached.
 */
export async function GET(request: Request) {
  const year = parseShareYear(new URL(request.url).searchParams.get("year"));
  if (year === null) return new Response("A year between 2000 and 2100 is required.", { status: 400 });
  return shareImage(year);
}

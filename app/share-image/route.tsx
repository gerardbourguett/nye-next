import { shareImage } from "@/lib/og-image";
import { parseEditionYear } from "@/lib/relay-clock";

/**
 * The share image for a given edition (`?year=2028`), for previews of an edition other than
 * the real one. The real pages use /opengraph-image and /twitter-image, which follow the clock.
 * The year is bounded to the editions a preview can show, and the image is the same every time for it.
 */
export async function GET(request: Request) {
  const year = parseEditionYear(new URL(request.url).searchParams.get("year"));
  if (year === null) return new Response("An edition year a preview can show (2000 to 2101) is required.", { status: 400 });
  return shareImage(year);
}

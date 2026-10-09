import type { Metadata } from "next";

import { editionTag, editionYear } from "@/lib/edition";
import { requestEdition } from "@/lib/edition-server";
import { siteUrl } from "@/lib/site";
import { parseSimulation } from "@/lib/relay-clock";
import { Countdown } from "./countdown";

// A preview (`?at=&speed=`) names the edition of its simulated instant, not today's,
// and is kept out of search results.
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const { at, speed } = await searchParams;
  const simulation = parseSimulation(at, speed);
  if (!simulation) return { alternates: { canonical: "/" } };
  const tag = editionTag(editionYear(simulation.at));
  return {
    title: { absolute: `${tag} (preview)` },
    description: `A preview of ${tag} at a simulated time.`,
    openGraph: { title: `${tag} (preview)`, description: `A preview of ${tag} at a simulated time.`, siteName: tag },
    robots: { index: false, follow: false },
  };
}

// The served markup never carries a stale year; the client keeps re-deriving
// the edition while the page stays open.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { at, speed } = await searchParams;
  const simulation = parseSimulation(at, speed);
  const initialYear = simulation ? editionYear(simulation.at) : await requestEdition();
  return <>
    {/* Only for the real page: a preview is not the site. `<` is escaped so the data cannot close the script. */}
    {!simulation && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: editionTag(initialYear),
      url: siteUrl().href,
      inLanguage: "en",
      description: `Follow New Year ${initialYear} as midnight crosses every timezone, and watch vanderfondi's live broadcast.`,
    }).replaceAll("<", "\\u003c") }} />}
    <Countdown initialYear={initialYear} simulation={simulation} />
  </>;
}

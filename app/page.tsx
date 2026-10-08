import type { Metadata } from "next";

import { editionYear } from "@/lib/edition";
import { requestEdition } from "@/lib/edition-server";
import { parseSimulation } from "@/lib/relay-clock";
import { Countdown } from "./countdown";

// A preview (`?at=&speed=`) is kept out of search results.
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const { at, speed } = await searchParams;
  return parseSimulation(at, speed) ? { robots: { index: false, follow: false } } : {};
}

// The served markup never carries a stale year; the client keeps re-deriving
// the edition while the page stays open.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { at, speed } = await searchParams;
  const simulation = parseSimulation(at, speed);
  const initialYear = simulation ? editionYear(simulation.at) : await requestEdition();
  return <Countdown initialYear={initialYear} simulation={simulation} />;
}

import type { Metadata } from "next";

import { getRelayBands } from "@/data/relay";
import { requestEdition } from "@/lib/edition-server";
import { relaySchedule } from "@/lib/streams/server";
import { crossingStreams, type CrossingStreams } from "@/lib/streams/relay-link";
import { loadRelayCatalog } from "@/lib/timezones/server";
import { RelayBoard } from "./relay-board";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const year = await requestEdition();
  return {
    title: "The Relay",
    description: `Every place on Earth, ordered by when its own midnight crosses into ${year} — from the first timezone to reach it to the last.`,
  };
}

// The relay must render without programming: a missing or failing schedule
// only hides the per-crossing stream links.
async function loadCrossingStreams(year: number): Promise<CrossingStreams> {
  try {
    return crossingStreams(await relaySchedule(year), year);
  } catch {
    return {};
  }
}

export default async function Page() {
  const year = await requestEdition();
  const [catalog, streams] = await Promise.all([loadRelayCatalog(), loadCrossingStreams(year)]);
  const bands = getRelayBands(year, catalog);

  return <RelayBoard bands={bands} year={year} streams={streams} />;
}

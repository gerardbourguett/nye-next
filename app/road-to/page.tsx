import type { Metadata } from "next";

import { getRelayBands } from "@/data/relay";
import { requestEdition } from "@/lib/edition-server";
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

export default async function Page() {
  const year = await requestEdition();
  const bands = getRelayBands(year, await loadRelayCatalog());

  return <RelayBoard bands={bands} year={year} />;
}

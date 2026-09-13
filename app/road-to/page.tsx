import type { Metadata } from "next";

import { getRelayBands, ROLLOVER_YEAR } from "@/data/relay";
import { loadRelayCatalog } from "@/lib/timezones/server";
import { RelayBoard } from "./relay-board";

export const metadata: Metadata = {
  title: `The Relay — #${ROLLOVER_YEAR}Live`,
  description: `Every place on Earth, ordered by when its own midnight crosses into ${ROLLOVER_YEAR} — from the first timezone to reach it to the last.`,
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const bands = getRelayBands(await loadRelayCatalog());

  return <RelayBoard bands={bands} />;
}

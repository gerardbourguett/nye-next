import { StreamShell } from "@/components/streams/shell";
import type { Metadata } from "next";
import { editionTag, editionYear } from "@/lib/edition";
import { parseSimulation, simulationHref } from "@/lib/relay-clock";
import { parseSelection } from "@/lib/streams/domain";
import { ViewingRoom } from "./viewing-room";

export const dynamic = "force-dynamic";

// A preview (`?at=&speed=`) is kept out of search results.
export async function generateMetadata({ searchParams }: PageProps<"/watch">): Promise<Metadata> {
  const { at, speed } = await searchParams;
  const simulation = parseSimulation(at, speed);
  // A preview may show another edition than the root template's, so it names its own year.
  return simulation
    ? { title: { absolute: `Viewing room (preview) | ${editionTag(editionYear(simulation.at))}` }, robots: { index: false, follow: false } }
    : { title: "Viewing room" };
}

export default async function WatchPage({ searchParams }: PageProps<"/watch">) {
  const { slot, stream, at, speed } = await searchParams;
  const simulation = parseSimulation(at, speed);
  return <StreamShell wide relayHref={simulation ? simulationHref(simulation.at, simulation.speed) : undefined} title="The viewing room." description="Choose what to watch as the night moves around the world. One player, with the alternatives close at hand.">
    {/* Keyed by the clock, so leaving a preview (or changing it) starts from an empty room instead of a snapshot read at another instant. */}
    <ViewingRoom key={simulation ? `${simulation.at}:${simulation.speed}` : "real"} requested={parseSelection(slot, stream)} simulation={simulation} />
  </StreamShell>;
}

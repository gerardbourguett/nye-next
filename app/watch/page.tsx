import { StreamShell } from "@/components/streams/shell";
import type { Metadata } from "next";
import { editionTag, editionYear } from "@/lib/edition";
import { previewSocial } from "@/lib/preview-metadata";
import { parseSimulation, simulationHref } from "@/lib/relay-clock";
import { parseSelection } from "@/lib/streams/domain";
import { ViewingRoom } from "./viewing-room";

export const dynamic = "force-dynamic";

// A preview (`?at=&speed=`) is kept out of search results.
export async function generateMetadata({ searchParams }: PageProps<"/watch">): Promise<Metadata> {
  const { at, speed } = await searchParams;
  const simulation = parseSimulation(at, speed);
  // A preview may show another edition than the root template's, so it names its own year (also when shared).
  if (simulation) {
    const edition = editionTag(editionYear(simulation.at));
    const title = `Viewing room (preview) | ${edition}`;
    return { title: { absolute: title }, robots: { index: false, follow: false }, ...previewSocial(edition, title, `A preview of the ${edition} viewing room at a simulated time.`) };
  }
  return {
    title: "Viewing room",
    description: "Choose what to watch as New Year moves around the world: the stream on now, what is coming up, and the chat, one player at a time.",
    // Deep links from the relay (?slot=&stream=) are the same page.
    alternates: { canonical: "/watch" },
  };
}

export default async function WatchPage({ searchParams }: PageProps<"/watch">) {
  const { slot, stream, at, speed } = await searchParams;
  const simulation = parseSimulation(at, speed);
  return <StreamShell wide relayHref={simulation ? simulationHref(simulation.at, simulation.speed) : undefined} title="The viewing room." description="Choose what to watch as the night moves around the world. One player, with the alternatives close at hand.">
    {/* Keyed by the clock, so leaving a preview (or changing it) starts from an empty room instead of a snapshot read at another instant. */}
    <ViewingRoom key={simulation ? `${simulation.at}:${simulation.speed}` : "real"} requested={parseSelection(slot, stream)} simulation={simulation} />
  </StreamShell>;
}

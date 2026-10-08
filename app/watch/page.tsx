import { StreamShell } from "@/components/streams/shell";
import type { Metadata } from "next";
import { parseSimulation } from "@/lib/relay-clock";
import { parseSelection } from "@/lib/streams/domain";
import { ViewingRoom } from "./viewing-room";

export const dynamic = "force-dynamic";

// A preview (`?at=&speed=`) is kept out of search results.
export async function generateMetadata({ searchParams }: PageProps<"/watch">): Promise<Metadata> {
  const { at, speed } = await searchParams;
  return { title: "Viewing room", ...(parseSimulation(at, speed) && { robots: { index: false, follow: false } }) };
}

export default async function WatchPage({ searchParams }: PageProps<"/watch">) {
  const { slot, stream, at, speed } = await searchParams;
  return <StreamShell wide title="The viewing room." description="Choose what to watch as the night moves around the world. One player, with the alternatives close at hand.">
    <ViewingRoom requested={parseSelection(slot, stream)} simulation={parseSimulation(at, speed)} />
  </StreamShell>;
}

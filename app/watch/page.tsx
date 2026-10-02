import { StreamShell } from "@/components/streams/shell";
import { parseSelection } from "@/lib/streams/domain";
import { ViewingRoom } from "./viewing-room";

export const dynamic = "force-dynamic";
export const metadata = { title: "Viewing room" };

export default async function WatchPage({ searchParams }: PageProps<"/watch">) {
  const { slot, stream } = await searchParams;
  return <StreamShell wide title="The viewing room." description="Choose what to watch as the night moves around the world. One player, with the alternatives close at hand.">
    <ViewingRoom requested={parseSelection(slot, stream)} />
  </StreamShell>;
}

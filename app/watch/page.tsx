import { StreamShell } from "@/components/streams/shell";
import { ViewingRoom } from "./viewing-room";

export const dynamic = "force-dynamic";
export const metadata = { title: "Viewing room" };

export default function WatchPage() {
  return <StreamShell title="The viewing room." description="Choose what to watch as the night moves around the world. One player, with the hourly alternatives close at hand.">
    <ViewingRoom />
  </StreamShell>;
}

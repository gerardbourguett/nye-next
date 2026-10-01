import { requestEdition } from "@/lib/edition-server";
import { Countdown } from "./countdown";

// The served markup never carries a stale year; the client keeps re-deriving
// the edition while the page stays open.
export default async function Home() {
  return <Countdown initialYear={await requestEdition()} />;
}

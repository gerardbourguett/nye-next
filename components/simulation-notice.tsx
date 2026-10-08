import Link from "next/link";

import type { Simulation } from "@/lib/relay-clock";
import { cn } from "@/lib/utils";

/**
 * Says the page is a preview. Only the static sentence is a live region; the
 * ticking clock beside it would otherwise be announced every second.
 */
export function SimulationNotice({ simulation, now, exitHref, className }: {
  simulation: Simulation;
  /** The simulated instant, or null before the clock has mounted. */
  now: number | null;
  exitHref: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border px-4 py-3 text-xs leading-relaxed tabular-nums", className)}>
      <p role="status">
        <strong>Preview</strong>: simulated time{simulation.speed > 1 && ` at ${simulation.speed}× speed`}. Nothing here is live.
      </p>
      <p>
        {now !== null && <time dateTime={new Date(now).toISOString()}>{new Date(now).toISOString().slice(0, 19).replace("T", " ")} UTC</time>}{" "}
        <Link href={exitHref} className="underline decoration-dotted underline-offset-4">Back to real time</Link>
      </p>
    </div>
  );
}

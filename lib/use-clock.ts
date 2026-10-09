"use client";

import { useEffect, useState } from "react";

import { readClock, type Simulation } from "@/lib/relay-clock";

/**
 * The page's "now": real time, or the simulated instant advanced from the
 * moment of mount. `null` until mounted, so the first client render matches
 * the server's.
 */
export function useClock(simulation: Simulation | null, tickMs = 1_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  const at = simulation?.at ?? null;
  const speed = simulation?.speed ?? 1;

  useEffect(() => {
    const clock = at === null ? null : { at, speed };
    const anchor = Date.now();
    const tick = () => setNow(readClock(clock, anchor, Date.now()));
    tick();
    const interval = setInterval(tick, tickMs);
    return () => clearInterval(interval);
  }, [at, speed, tickMs]);

  return now;
}

/**
 * Simulated time for previewing the relay before (or after) the night:
 * `/road-to?at=<ISO instant>&speed=<1–3600>`. Pure, so the server page and
 * the client board read the same simulation from the same query.
 */
export type Simulation = { at: number; speed: number };

const MIN = Date.UTC(2000, 0, 1);
const MAX = Date.UTC(2101, 0, 1);
export const MAX_SPEED = 3_600;

export function parseSimulation(at: unknown, speed: unknown): Simulation | null {
  if (typeof at !== "string" || at.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(at)) return null;
  const instant = Date.parse(at);
  if (!Number.isFinite(instant) || instant < MIN || instant >= MAX) return null;
  const rate = typeof speed === "string" && /^\d{1,4}$/.test(speed) ? Number(speed) : 1;
  return { at: instant, speed: Math.min(MAX_SPEED, Math.max(1, rate)) };
}

/**
 * The board's "now": real time, or the simulated instant advanced at
 * `speed` since `anchor`, the real time at which the simulation started.
 */
export function readClock(simulation: Simulation | null, anchor: number, realNow: number): number {
  return simulation ? simulation.at + (realNow - anchor) * simulation.speed : realNow;
}

export function simulationHref(at: number, speed: number): string {
  return `/road-to?${new URLSearchParams({ at: new Date(at).toISOString(), speed: String(speed) })}`;
}

/** `d HH:MM:SS` until an instant, clamped at zero. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  const clock = [Math.floor((total % 86_400) / 3_600), Math.floor((total % 3_600) / 60), total % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return days > 0 ? `${days}d ${clock}` : clock;
}

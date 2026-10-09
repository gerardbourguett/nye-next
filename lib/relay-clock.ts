import { editionYear } from "./edition";

/**
 * Simulated time for previewing the site before (or after) the night:
 * `?at=<ISO instant>&speed=<1–3600>` on `/`, `/road-to` and `/watch`. Pure,
 * so the server page and the client read the same simulation from the same query.
 */
export type Simulation = { at: number; speed: number };

const MIN = Date.UTC(2000, 0, 1);
const MAX = Date.UTC(2101, 0, 1);

/** The first and last edition a valid simulation can show (the last, 2101, starts at noon UTC on 1 January 2100). */
export const MIN_EDITION_YEAR = editionYear(MIN);
export const MAX_EDITION_YEAR = editionYear(MAX - 1);

/** An edition year a simulation can show, from text (`?year=2028`), or null. Derived from the simulation's own bounds so the two cannot drift apart. */
export function parseEditionYear(value: string | null): number | null {
  if (value === null || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= MIN_EDITION_YEAR && year <= MAX_EDITION_YEAR ? year : null;
}
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

/** The query that carries a simulation from page to page. */
export function simulationQuery(at: number, speed: number): string {
  return new URLSearchParams({ at: new Date(at).toISOString(), speed: String(speed) }).toString();
}

export function simulationHref(at: number, speed: number, path = "/road-to"): string {
  return `${path}?${simulationQuery(at, speed)}`;
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

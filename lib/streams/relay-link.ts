import { resolveRolloverArrival } from "../../data/relay";
import { cityFromZoneName } from "../zones";
import { optionKey, type Provider, type Slot } from "./domain";

/** A published stream option tied, through its place, to one relay crossing. */
export type CrossingStream = {
  slotId: string;
  slotTitle: string;
  startsAt: string;
  endsAt: string;
  key: string;
  label: string;
  provider: Provider;
  zone: string;
  city: string;
};

/** Keyed by the crossing's offset minutes, matching `RelayBand.offsetMinutes`. */
export type CrossingStreams = Record<number, CrossingStream[]>;

/**
 * Slots overlapping this window can belong to the wave into `year`: the first midnight (UTC+14)
 * is 10:00 UTC on December 31 and the last (UTC−12) is 12:00 UTC on
 * January 1, with room on both sides for pre-shows and late celebrations.
 */
export function editionStreamWindow(year: number) {
  return { from: Date.UTC(year - 1, 11, 30, 12), to: Date.UTC(year, 0, 2) };
}

/**
 * Group published options that name a place by the offset that place
 * observes at its own midnight into `year`. Options without a place, places
 * this runtime cannot resolve, and slots outside the edition are left out.
 */
export function crossingStreams(slots: readonly Slot[], year: number): CrossingStreams {
  const { from, to } = editionStreamWindow(year);
  const offsets = new Map<string, number | null>();
  const result: CrossingStreams = {};

  for (const slot of slots) {
    // Overlap, not start: a long rehearsal may begin before the window and
    // still be on air during the crossings.
    if (!slot.published || Date.parse(slot.ends_at) <= from || Date.parse(slot.starts_at) >= to) continue;
    for (const option of slot.options) {
      if (!option.zone) continue;
      if (!offsets.has(option.zone)) {
        try {
          offsets.set(option.zone, resolveRolloverArrival(option.zone, year).offsetMinutes);
        } catch {
          offsets.set(option.zone, null);
        }
      }
      const offset = offsets.get(option.zone);
      if (offset === null || offset === undefined) continue;
      (result[offset] ??= []).push({
        slotId: slot.id,
        slotTitle: slot.title,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
        key: optionKey(option),
        label: option.label,
        provider: option.provider,
        zone: option.zone,
        city: cityFromZoneName(option.zone),
      });
    }
  }

  for (const list of Object.values(result)) {
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.label.localeCompare(b.label));
  }
  return result;
}

/** `simulation` is a preview's query (`at=…&speed=…`), carried so the room shares the relay's clock. */
export function watchHref(stream: Pick<CrossingStream, "slotId" | "key">, simulation?: string) {
  const query = new URLSearchParams({ slot: stream.slotId, stream: stream.key });
  return `/watch?${simulation ? `${query}&${simulation}` : query}`;
}

/**
 * Which `#<year>Live` edition the site is on. The single source of truth for
 * the year: home, relay, metadata and route titles all derive from here.
 *
 * Edition Y covers the run-up to January 1 of Y and the whole midnight wave
 * into it. UTC−12 is the last offset to reach midnight, at 12:00 UTC on
 * January 1, so the wave into Y is over by then and the site hands off to
 * edition Y + 1 instead of freezing at zero.
 */
const WAVE_END_UTC_HOUR = 12;

export function editionYear(now: number): number {
  const year = new Date(now).getUTCFullYear();
  return now < Date.UTC(year, 0, 1, WAVE_END_UTC_HOUR) ? year : year + 1;
}

export function editionTag(year: number): string {
  return `#${year}Live`;
}

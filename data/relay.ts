import raw from "./timezones.json";

export interface TimezoneRecord {
  countryCode: string;
  countryName: string;
  zoneName: string;
}

export type RelayPlace = {
  zoneName: string;
  city: string;
  countryCode: string;
  countryName: string;
};

export type RelayBand = {
  offsetMinutes: number;
  offsetLabel: string;
  /** ISO instant, in UTC, of this band's local midnight into the target year. */
  arrivalUtc: string;
  places: RelayPlace[];
};

// zoneName's last path segment, for the handful that don't read as a place
// name once underscores become spaces.
const CITY_NAME_OVERRIDES: Record<string, string> = {
  DumontDUrville: "Dumont d'Urville",
};

/**
 * The UTC offset a zone actually observes at a given instant. Derived from
 * Intl rather than trusted from timezones.json's stored gmtOffset field,
 * which is a snapshot from whenever the file was captured (August) — DST
 * means most Northern-hemisphere zones run an hour fast against what they'll
 * observe on Dec 31, and most Southern-hemisphere zones run an hour slow.
 */
function offsetMinutesAt(zoneName: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneName,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The offset a zone observes at the instant its own clock reaches local
 * midnight on January 1 of `year`. Resolved by one round of fixed-point
 * refinement so a zone that shifts DST across New Year's Eve still lands on
 * the offset actually in effect at the crossing, not a guess from months out.
 */
export function resolveRolloverArrival(
  zoneName: string,
  year: number,
): { offsetMinutes: number; arrivalUtcMs: number } {
  const guessUtcMs = Date.UTC(year, 0, 1, 0, 0, 0);
  let offsetMinutes = offsetMinutesAt(zoneName, new Date(guessUtcMs));
  let arrivalUtcMs = guessUtcMs - offsetMinutes * 60_000;

  const refined = offsetMinutesAt(zoneName, new Date(arrivalUtcMs));
  if (refined !== offsetMinutes) {
    offsetMinutes = refined;
    arrivalUtcMs = guessUtcMs - offsetMinutes * 60_000;
  }

  return { offsetMinutes, arrivalUtcMs };
}

function cityFromZoneName(zoneName: string): string {
  const last = zoneName.split("/").at(-1) ?? zoneName;
  return (
    CITY_NAME_OVERRIDES[last] ?? last.replace(/_/g, " ").replace(/^St /, "St. ")
  );
}

export function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "−" : "+";
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

/**
 * Every place in timezones.json, grouped by the offset it actually observes
 * at the crossing into `year` and ordered by arrival — first place on
 * Earth to reach midnight first. Buckets are derived from the data, never
 * hardcoded to 24: DST and the half/quarter-hour zones (Kathmandu +05:45,
 * Eucla +08:45, Chatham +12:45 in its own DST) mean the real count varies.
 */
export function getRelayBands(
  year: number,
  zones: readonly TimezoneRecord[] = raw.zones,
): RelayBand[] {
  const byOffset = new Map<number, { arrivalUtcMs: number; places: RelayPlace[] }>();

  for (const zone of zones) {
    let arrival: { offsetMinutes: number; arrivalUtcMs: number };
    try {
      arrival = resolveRolloverArrival(zone.zoneName, year);
    } catch {
      // Intl couldn't resolve this IANA name in this runtime — skip rather
      // than show a fabricated offset for it.
      continue;
    }

    const bucket = byOffset.get(arrival.offsetMinutes) ?? {
      arrivalUtcMs: arrival.arrivalUtcMs,
      places: [],
    };
    bucket.places.push({
      zoneName: zone.zoneName,
      city: cityFromZoneName(zone.zoneName),
      countryCode: zone.countryCode,
      countryName: zone.countryName,
    });
    byOffset.set(arrival.offsetMinutes, bucket);
  }

  return [...byOffset.entries()]
    .sort(([a], [b]) => b - a)
    .map(([offsetMinutes, { arrivalUtcMs, places }]) => ({
      offsetMinutes,
      offsetLabel: formatOffsetLabel(offsetMinutes),
      arrivalUtc: new Date(arrivalUtcMs).toISOString(),
      places: places.sort((a, b) => a.city.localeCompare(b.city)),
    }));
}

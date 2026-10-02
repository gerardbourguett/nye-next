// Shared IANA zone helpers. Pure and dependency-free, so client bundles can
// use them without pulling in the bundled timezone catalog.

/** Area/Location names only (`America/Santiago`, `America/Argentina/Salta`). */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){1,2}$/;

// zoneName's last path segment, for the handful that don't read as a place
// name once underscores become spaces.
const CITY_NAME_OVERRIDES: Record<string, string> = {
  DumontDUrville: "Dumont d'Urville",
  Sao_Paulo: "São Paulo",
  St_Johns: "St. John's",
};

export function isZoneName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && ZONE_NAME.test(value);
}

/** Whether this runtime's Intl can resolve the zone. Coverage varies by runtime. */
export function isSupportedZone(zoneName: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zoneName });
    return true;
  } catch {
    return false;
  }
}

export function cityFromZoneName(zoneName: string): string {
  const last = zoneName.split("/").at(-1) ?? zoneName;
  return (
    CITY_NAME_OVERRIDES[last] ?? last.replace(/_/g, " ").replace(/^St /, "St. ")
  );
}

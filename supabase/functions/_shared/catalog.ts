export const IANA_SOURCE = "https://data.iana.org/time-zones/tzdata-latest.tar.gz";
export const MAX_CATALOG_BYTES = 256_000;
export type CatalogZone = { zoneName: string; countryCode: string; countryName: string };
export type Catalog = { version: string; source: string; zones: CatalogZone[] };
export const validVersion = (value: string) => /^(?:20\d{2})(?:z{0,7}[a-z])$/.test(value);
export const validZoneName = (value: string) =>
  value.length <= 100 && /^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(value);

export function compareVersions(a: string, b: string): number {
  if (!validVersion(a) || !validVersion(b)) throw new Error("version_invalid");
  return Number(a.slice(0, 4)) - Number(b.slice(0, 4)) ||
    a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

export function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== "object") return false;
  const item = value as Catalog;
  if (Object.keys(item).sort().join() !== "source,version,zones" ||
      typeof item.version !== "string" || !validVersion(item.version) ||
      item.source !== IANA_SOURCE || !Array.isArray(item.zones) ||
      item.zones.length < 1 || item.zones.length > 1_000 ||
      new TextEncoder().encode(JSON.stringify(item)).length > MAX_CATALOG_BYTES) return false;
  const seen = new Set<string>();
  return item.zones.every((zone) => {
    if (!zone || typeof zone !== "object" ||
        Object.keys(zone).sort().join() !== "countryCode,countryName,zoneName" ||
        typeof zone.zoneName !== "string" || !validZoneName(zone.zoneName) ||
        typeof zone.countryCode !== "string" || !/^[A-Z]{2}$/.test(zone.countryCode) ||
        typeof zone.countryName !== "string" || zone.countryName.length < 1 ||
        zone.countryName.length > 100 || zone.countryName.trim() !== zone.countryName ||
        /\p{Cc}/u.test(zone.countryName) || seen.has(zone.zoneName)) return false;
    seen.add(zone.zoneName);
    return true;
  });
}

export function preservesCoverage(zones: CatalogZone[], previous: CatalogZone[]): boolean {
  const byName = new Map(zones.map((zone) => [zone.zoneName, zone.countryCode]));
  return previous.every((zone) => byName.get(zone.zoneName) === zone.countryCode);
}

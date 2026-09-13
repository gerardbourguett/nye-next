import bundled from "../../data/timezones.json";
import { isCatalog, preservesCoverage, type CatalogZone } from "../../supabase/functions/_shared/catalog";
import { readBounded } from "../../supabase/functions/_shared/iana";

type Config = { url: string; key: string } | null;

/** Offline-testable server adapter. Failures never replace the bundled fallback. */
export async function loadCatalog(config: Config, fetcher: typeof fetch): Promise<CatalogZone[]> {
  if (!config) return bundled.zones;
  try {
    const signal = AbortSignal.timeout(4_000);
    const response = await fetcher(`${config.url}/rest/v1/timezone_catalog?select=catalog,fetched_at,checked_at&id=eq.true&limit=1`, {
      headers: { apikey: config.key }, cache: "no-store", redirect: "error", signal,
    });
    if (!response.ok || !response.body) return bundled.zones;
    const rows: unknown = JSON.parse(new TextDecoder().decode(await readBounded(response.body, 300_000, signal)));
    if (!Array.isArray(rows) || rows.length !== 1) return bundled.zones;
    const row = rows[0];
    if (!row || !isCatalog(row.catalog) || row.catalog.zones.length < 350 ||
        !preservesCoverage(row.catalog.zones, bundled.zones)) return bundled.zones;
    const validDate = (value: unknown) => typeof value === "string" &&
      /^20\d{2}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
    if (!validDate(row.fetched_at) || !validDate(row.checked_at) ||
        Date.parse(row.fetched_at) > Date.parse(row.checked_at) ||
        Date.parse(row.checked_at) > Date.now() + 300_000) return bundled.zones;
    return row.catalog.zones;
  } catch {
    return bundled.zones;
  }
}

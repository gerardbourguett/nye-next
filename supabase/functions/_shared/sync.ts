import { compareVersions, isCatalog, preservesCoverage, type Catalog, type CatalogZone } from "./catalog.ts";

const reasons = new Set([
  "upstream_unavailable", "size_limit", "archive_invalid", "archive_missing_files",
  "version_invalid", "catalog_invalid", "alias_invalid", "coverage_loss",
  "version_regression", "same_version_changed",
]);
export type SyncDependencies = {
  secret: string | undefined;
  baseline: CatalogZone[];
  begin: () => Promise<string | null>;
  current: () => Promise<Catalog | null>;
  fetchCatalog: (previous: CatalogZone[]) => Promise<Catalog>;
  finish: (token: string, catalog: Catalog | null, error: string | null) => Promise<string>;
};

async function authorized(supplied: string | null, expected: string | undefined): Promise<boolean> {
  if (!expected || expected.length < 32 || expected.length > 256 || !supplied || supplied.length > 256) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(supplied), hash(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** The deployed handler uses this exact seam; no user input controls URLs or data. */
export function createSyncHandler(deps: SyncDependencies) {
  return async (request: Request): Promise<Response> => {
    const reply = (code: string, status: number) => Response.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
    if (!await authorized(request.headers.get("x-timezone-sync-secret"), deps.secret)) return reply("unauthorized", 401);
    if (request.method !== "POST") return reply("method_not_allowed", 405);
    let token: string | null = null;
    try {
      token = await deps.begin();
      if (!token) return reply("already_running", 409);
      const current = await deps.current();
      if (current !== null && !isCatalog(current)) throw new Error("catalog_invalid");
      if (current && !preservesCoverage(current.zones, deps.baseline)) throw new Error("coverage_loss");
      const previous = [...new Map([...deps.baseline, ...(current?.zones ?? [])].map((zone) => [zone.zoneName, zone])).values()];
      const catalog = await deps.fetchCatalog(previous);
      if (!isCatalog(catalog)) throw new Error("catalog_invalid");
      if (!preservesCoverage(catalog.zones, previous)) throw new Error("coverage_loss");
      if (current && compareVersions(catalog.version, current.version) < 0) throw new Error("version_regression");
      const result = await deps.finish(token, catalog, null);
      return reply(result, result === "ok" ? 200 : 409);
    } catch (error) {
      const reason = error instanceof Error && reasons.has(error.message) ? error.message : "sync_failed";
      if (token) {
        try { await deps.finish(token, null, reason); } catch { /* DB unavailable: lease expires, last-good remains. */ }
      }
      return reply(reason, 503);
    }
  };
}

/**
 * What `/health` reports. Pure, so the rules are tested without a server.
 *
 * `down` is the only state that should page someone: the schedule cannot be
 * read, so the viewing room is broken. `degraded` means something needs
 * attention but the site still works (the IANA catalog is stale or was never
 * synchronised, or Supabase is not configured here).
 */
export type ScheduleState = "ok" | "unavailable" | "unconfigured";
export type CatalogState = "ok" | "stale" | "unknown" | "unconfigured";
export type Health = {
  status: "ok" | "degraded" | "down";
  schedule: ScheduleState;
  catalog: CatalogState;
  /** Hours since the catalog was last checked against IANA, when known. */
  catalogAgeHours: number | null;
};

/** The daily sync runs at 03:15 UTC; two days without a successful check means it has stopped. */
export const CATALOG_STALE_HOURS = 48;

export function assessHealth(input: { schedule: ScheduleState; configured: boolean; catalogCheckedAt: string | null; now: number }): Health {
  const { schedule, configured, catalogCheckedAt, now } = input;
  let catalog: CatalogState = "unknown";
  let catalogAgeHours: number | null = null;
  if (!configured) catalog = "unconfigured";
  else if (catalogCheckedAt !== null && Number.isFinite(Date.parse(catalogCheckedAt))) {
    // A timestamp in the future is a clock or data problem, not freshness.
    const age = (now - Date.parse(catalogCheckedAt)) / 3_600_000;
    if (age >= -0.1) {
      catalogAgeHours = Math.max(0, Math.round(age * 10) / 10);
      catalog = age > CATALOG_STALE_HOURS ? "stale" : "ok";
    }
  }
  const status = schedule === "unavailable" ? "down" : schedule === "ok" && catalog === "ok" ? "ok" : "degraded";
  return { status, schedule, catalog, catalogAgeHours };
}

/** A request error as one log line: the route and the error digest, never request bodies or headers. */
export function describeRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string },
): string {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return JSON.stringify({
    event: "request_error",
    method: request.method,
    // The route pattern, not the URL: queries can carry viewer data and signed stream addresses.
    route: context.routePath ?? request.path.split("?")[0],
    type: context.routeType,
    digest,
    message: message.slice(0, 300),
  });
}

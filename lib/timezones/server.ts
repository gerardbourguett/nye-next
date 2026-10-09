import "server-only";
import { supabaseConfig, uncachedFetch } from "../supabase/config";
import { ttlCache } from "../ttl-cache";
import { loadCatalog } from "./load-catalog";

// Shared for 30 seconds within a server instance: a burst of visitors costs one read. The open board refreshes every five minutes.
const relayCatalog = ttlCache<null, Awaited<ReturnType<typeof loadCatalog>>>(() => loadCatalog(supabaseConfig(), uncachedFetch), 30_000);
export function loadRelayCatalog() {
  return relayCatalog(null);
}

/**
 * When the catalog was last checked against IANA (`checked_at`), or null if it cannot be read.
 * A bounded anonymous read of the one public row; `/health` uses it to notice a stopped daily sync.
 */
export async function catalogCheckedAt(): Promise<string | null> {
  const config = supabaseConfig();
  if (!config) return null;
  try {
    const response = await uncachedFetch(`${config.url}/rest/v1/timezone_catalog?select=checked_at&id=eq.true&limit=1`, {
      headers: { apikey: config.key }, redirect: "error", signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    const value = Array.isArray(rows) && rows.length === 1 ? (rows[0] as { checked_at?: unknown }).checked_at : null;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

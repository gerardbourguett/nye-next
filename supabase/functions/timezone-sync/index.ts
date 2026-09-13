import baseline from "../../../data/timezones.json" with { type: "json" };
import { isCatalog } from "../_shared/catalog.ts";
import { fetchCatalog, readBounded } from "../_shared/iana.ts";
import { createSyncHandler } from "../_shared/sync.ts";

// Server-only built-in Supabase environment. This key has project-wide service-role
// authority, not a narrowly scoped worker identity. Never send it to the browser.
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function database(path: string, body?: unknown): Promise<unknown> {
  if (!url || !key) throw new Error("sync_failed");
  const signal = AbortSignal.timeout(8_000);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal, redirect: "error", cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error("sync_failed");
  return JSON.parse(new TextDecoder().decode(await readBounded(response.body, 300_000, signal)));
}

Deno.serve(createSyncHandler({
  secret: Deno.env.get("TIMEZONE_SYNC_SECRET"),
  baseline: baseline.zones,
  begin: async () => {
    const token = await database("rpc/begin_timezone_sync", {});
    if (token === null) return null;
    if (typeof token !== "string" || !/^[0-9a-f-]{36}$/.test(token)) throw new Error("sync_failed");
    return token;
  },
  current: async () => {
    const rows = await database("timezone_catalog?select=catalog&id=eq.true&limit=1");
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("catalog_invalid");
    if (!rows.length) return null;
    if (!isCatalog(rows[0]?.catalog)) throw new Error("catalog_invalid");
    return rows[0].catalog;
  },
  fetchCatalog,
  finish: async (token, catalog, error) => {
    const result = await database("rpc/finish_timezone_sync", { p_token: token, p_catalog: catalog, p_error: error });
    if (typeof result !== "string") throw new Error("sync_failed");
    return result;
  },
}));

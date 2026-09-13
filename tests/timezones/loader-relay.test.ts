import assert from "node:assert/strict";
import test from "node:test";
import bundled from "../../data/timezones.json";
import { getRelayBands, resolveRolloverArrival } from "../../data/relay";
import { loadCatalog } from "../../lib/timezones/load-catalog";
import { isCatalog } from "../../supabase/functions/_shared/catalog";
import { catalog } from "./fixtures";

const config = { url: "https://example.invalid", key: "synthetic-public-key" };
const row = () => ({ catalog: catalog(bundled.zones), fetched_at: "2026-01-01T00:00:00Z", checked_at: "2026-01-02T00:00:00Z" });
const jsonFetch = (data: unknown, status = 200): typeof fetch => async () => Response.json(data, { status });

test("loader uses validated persisted data, public key only, no-store and bounded request", async () => {
  const data = row(); data.catalog.zones.push({ zoneName: "Synthetic/New_Place", countryCode: "NP", countryName: "Nepal" });
  const fetcher: typeof fetch = async (input, init) => {
    assert.match(String(input), /timezone_catalog\?select=catalog,fetched_at,checked_at/);
    assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("Authorization"), null);
    assert.ok(init?.signal);
    return Response.json([data]);
  };
  assert.deepEqual(await loadCatalog(config, fetcher), data.catalog.zones);
});

test("missing configuration never fetches", async () => {
  assert.equal(await loadCatalog(null, async () => { throw new Error("must not fetch"); }), bundled.zones);
});

test("missing table, missing row, denied read, network failure and corrupt JSON fall back", async () => {
  for (const status of [404, 403, 500]) assert.equal(await loadCatalog(config, jsonFetch({}, status)), bundled.zones);
  assert.equal(await loadCatalog(config, jsonFetch([])), bundled.zones);
  assert.equal(await loadCatalog(config, async () => { throw new Error("offline"); }), bundled.zones);
  assert.equal(await loadCatalog(config, async () => new Response("not json")), bundled.zones);
  assert.equal(await loadCatalog(config, async () => new Response("x".repeat(300_001))), bundled.zones);
});

test("whole-snapshot validation rejects duplicate zones, lost coverage, unsafe labels and metadata", async () => {
  const invalid = [
    { ...row(), catalog: { ...row().catalog, source: "https://example.invalid/other" } },
    { ...row(), checked_at: "infinity" },
    { ...row(), checked_at: "2099-01-01T00:00:00Z" },
    { ...row(), checked_at: "2025-01-01T00:00:00Z" },
  ];
  const duplicate = row(); duplicate.catalog.zones.push(duplicate.catalog.zones[0]); invalid.push(duplicate);
  const missing = row(); missing.catalog.zones.pop(); invalid.push(missing);
  const label = row(); label.catalog.zones[0].countryName = "invalid\nlabel"; invalid.push(label);
  for (const value of invalid) assert.equal(await loadCatalog(config, jsonFetch([value])), bundled.zones);
  assert.equal(isCatalog({ ...row().catalog, secret: "not allowed" }), false);
});

test("fractional offsets and New Year DST use Intl at the target, never stored offsets", () => {
  for (const [zoneName, offset] of [["Asia/Kathmandu", 345], ["Australia/Eucla", 525], ["Pacific/Chatham", 825], ["Australia/Adelaide", 630], ["America/St_Johns", -210]] as const) {
    const arrival = resolveRolloverArrival(zoneName);
    assert.equal(arrival.offsetMinutes, offset);
    assert.equal(arrival.arrivalUtcMs, Date.UTC(2027, 0, 1) - offset * 60_000);
    const zone = { zoneName, countryCode: "NZ", countryName: "Synthetic", gmtOffset: 999999, timestamp: 0 };
    assert.equal(getRelayBands([zone])[0].offsetMinutes, offset);
  }
});

test("default catalog remains compatible; supplied catalog is used, sorted and unsupported names skipped", () => {
  assert.deepEqual(getRelayBands(), getRelayBands(bundled.zones));
  const zones = ["Asia/Kathmandu", "Australia/Eucla", "Unsupported/Zone"].map((zoneName) => ({ zoneName, countryCode: "NP", countryName: "Synthetic" }));
  assert.deepEqual(getRelayBands(zones).map((band) => band.offsetMinutes), [525, 345]);
  const place = bundled.zones.find((z) => z.zoneName === "Africa/El_Aaiun");
  assert.equal(place?.countryCode, "EH", "Explicit IANA-backed baseline correction");
});

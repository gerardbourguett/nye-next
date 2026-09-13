import assert from "node:assert/strict";
import test from "node:test";
import { createSyncHandler, type SyncDependencies } from "../../supabase/functions/_shared/sync";
import { catalog } from "./fixtures";

const secret = "synthetic-offline-test-secret-not-for-deployment";
const zone = { zoneName: "Asia/Kathmandu", countryCode: "NP", countryName: "Nepal" };
const request = (supplied: string | null = secret, method = "POST") => new Request("https://example.invalid/sync", {
  method, headers: supplied ? { "x-timezone-sync-secret": supplied } : {},
});

function harness(overrides: Partial<SyncDependencies> = {}) {
  let persisted = catalog([zone]);
  const calls: string[] = [];
  const deps: SyncDependencies = {
    secret, baseline: [zone],
    begin: async () => { calls.push("begin"); return "synthetic-lease"; },
    current: async () => persisted,
    fetchCatalog: async () => catalog([zone]),
    finish: async (_token, candidate, error) => {
      calls.push(error ?? "publish");
      if (candidate) persisted = candidate;
      return error ?? "ok";
    },
    ...overrides,
  };
  return { handle: createSyncHandler(deps), calls, persisted: () => persisted };
}

test("missing/wrong secret and non-POST perform no privileged work", async () => {
  const h = harness();
  for (const supplied of [null, "wrong", "x".repeat(257)]) assert.equal((await h.handle(request(supplied))).status, 401);
  assert.equal((await h.handle(request(secret, "GET"))).status, 405);
  assert.deepEqual(h.calls, []);
  assert.equal((await harness({ secret: undefined }).handle(request())).status, 401);
});

test("successful and unchanged daily checks reach the actual publication seam", async () => {
  const h = harness();
  assert.equal((await h.handle(request())).status, 200);
  assert.equal((await h.handle(request())).status, 200);
  assert.deepEqual(h.calls, ["begin", "publish", "begin", "publish"]);
});

test("overlapping lease does not fetch or finish", async () => {
  const h = harness({ begin: async () => null, fetchCatalog: async () => { throw new Error("must not fetch"); } });
  assert.equal((await h.handle(request())).status, 409);
  assert.deepEqual(h.calls, []);
});

for (const code of ["upstream_unavailable", "archive_invalid", "coverage_loss", "version_invalid", "size_limit"]) {
  test(`${code} retains last-good snapshot and records only a bounded code`, async () => {
    const h = harness({ fetchCatalog: async () => { throw new Error(code); } });
    const previous = h.persisted();
    const response = await h.handle(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code });
    assert.equal(h.persisted(), previous);
    assert.deepEqual(h.calls, ["begin", code]);
  });
}

test("unknown failures do not expose fetched bodies or credentials", async () => {
  const h = harness({ fetchCatalog: async () => { throw new Error("private upstream response text"); } });
  assert.deepEqual(await (await h.handle(request())).json(), { code: "sync_failed" });
  assert.deepEqual(h.calls, ["begin", "sync_failed"]);
});

test("regressing versions and dropped coverage never reach publication", async () => {
  const h = harness({ fetchCatalog: async () => ({ ...catalog([zone]), version: "2025a" }) });
  assert.deepEqual(await (await h.handle(request())).json(), { code: "version_regression" });
  const missing = harness({ fetchCatalog: async () => catalog([{ ...zone, zoneName: "Asia/Tokyo" }]) });
  assert.deepEqual(await (await missing.handle(request())).json(), { code: "coverage_loss" });
});

test("expired attempt and same-version conflict are not reported as successful", async () => {
  for (const code of ["stale_attempt", "same_version_changed"]) {
    const h = harness({ finish: async () => code });
    const response = await h.handle(request());
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code });
  }
});

test("database failure before fetch, or during failure recording, remains sanitized", async () => {
  const h = harness({ current: async () => { throw new Error("database unavailable"); }, finish: async () => { throw new Error("still unavailable"); } });
  assert.deepEqual(await (await h.handle(request())).json(), { code: "sync_failed" });
  assert.deepEqual(h.calls, ["begin"]);
});

test("a corrupted persisted catalog cannot override baseline country coverage", async () => {
  const h = harness({ current: async () => catalog([{ ...zone, countryCode: "XX" }]) });
  assert.deepEqual(await (await h.handle(request())).json(), { code: "coverage_loss" });
  assert.deepEqual(h.calls, ["begin", "coverage_loss"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { assessHealth, CATALOG_STALE_HOURS, describeRequestError } from "../../lib/health";

const NOW = Date.UTC(2026, 11, 1, 12);
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const health = (schedule: "ok" | "unavailable" | "unconfigured", checked: string | null, configured = true) =>
  assessHealth({ schedule, configured, catalogCheckedAt: checked, now: NOW });

test("a readable schedule and a fresh catalog is ok", () => {
  assert.deepEqual(health("ok", hoursAgo(9)), { status: "ok", schedule: "ok", catalog: "ok", catalogAgeHours: 9 });
});

test("a stale catalog is degraded, not down: the room still works", () => {
  assert.equal(health("ok", hoursAgo(CATALOG_STALE_HOURS - 1)).status, "ok");
  const stale = health("ok", hoursAgo(CATALOG_STALE_HOURS + 1));
  assert.deepEqual([stale.status, stale.catalog], ["degraded", "stale"]);
});

test("only an unreadable schedule is down", () => {
  assert.equal(health("unavailable", hoursAgo(1)).status, "down");
  assert.equal(health("unavailable", null).status, "down");
});

test("a catalog that was never synchronised, or has an odd timestamp, is unknown (degraded)", () => {
  for (const checked of [null, "not a date", hoursAgo(-5)]) {
    const result = health("ok", checked);
    assert.deepEqual([result.status, result.catalog, result.catalogAgeHours], ["degraded", "unknown", null]);
  }
});

test("without Supabase settings the site reports unconfigured, degraded rather than down", () => {
  const result = assessHealth({ schedule: "unconfigured", configured: false, catalogCheckedAt: null, now: NOW });
  assert.deepEqual([result.status, result.schedule, result.catalog], ["degraded", "unconfigured", "unconfigured"]);
});

test("a request error is one line with the route and digest, and no query string or body", () => {
  const error = Object.assign(new Error("boom ".repeat(200)), { digest: "abc123" });
  const line = JSON.parse(describeRequestError(error, { path: "/watch?slot=secret&at=2030", method: "GET" }, { routePath: "/watch", routeType: "render" }));
  assert.deepEqual([line.event, line.method, line.route, line.type, line.digest], ["request_error", "GET", "/watch", "render", "abc123"]);
  assert.ok(line.message.length <= 300);
  const noContext = JSON.parse(describeRequestError("plain", { path: "/x?token=1", method: "POST" }, {}));
  assert.deepEqual([noContext.route, noContext.message, noContext.digest], ["/x", "plain", undefined]);
});

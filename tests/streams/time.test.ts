import assert from "node:assert/strict";
import test from "node:test";
import { localToUtc, toLocalInput, validateLocalInstant } from "../../lib/streams/time";

test("server validates UTC against an explicitly supplied IANA timezone, including fractional offsets", () => {
  validateLocalInstant("2027-01-01T00:00", "Asia/Kathmandu", "2026-12-31T18:15:00.000Z");
  validateLocalInstant("2027-01-01T00:00", "Pacific/Chatham", "2026-12-31T10:15:00.000Z");
  assert.equal(toLocalInput("2026-12-31T18:15:00.000Z", "Asia/Kathmandu"), "2027-01-01T00:00");
});

test("invalid, incomplete, nonexistent, or mismatched local times never silently shift", () => {
  for (const local of ["", "2027-01", "2027-02-30T10:00", "2027-13-01T00:00", "2027-01-01T24:00", "2027-01-01T00:60"]) {
    assert.throws(() => validateLocalInstant(local, "UTC", "2027-01-01T00:00:00.000Z"));
  }
  assert.throws(() => validateLocalInstant("2027-01-01T00:00", "Not/AZone", "2027-01-01T00:00:00.000Z"));
  assert.throws(() => validateLocalInstant("2027-01-01T00:00", "Asia/Kathmandu", "2027-01-01T00:00:00.000Z"));
  assert.throws(() => validateLocalInstant("2027-01-01T00:00", "UTC", "2027-01-01T00:00:30.000Z"));
  assert.throws(() => validateLocalInstant("2027-03-14T02:30", "America/New_York", "2027-03-14T07:30:00.000Z"));
});

test("both occurrences of repeated daylight-saving wall time are rejected", () => {
  for (const utc of ["2027-11-07T05:30:00.000Z", "2027-11-07T06:30:00.000Z"]) {
    assert.throws(() => validateLocalInstant("2027-11-07T01:30", "America/New_York", utc), /occurs twice/);
  }
});

test("browser conversion uses its local timezone and rejects DST normalization", () => {
  process.env.TZ = "America/New_York";
  assert.equal(localToUtc("2027-01-01T00:00", "America/New_York"), "2027-01-01T05:00:00.000Z");
  assert.throws(() => localToUtc("2027-03-14T02:30", "America/New_York"), /does not exist/);
  assert.throws(() => localToUtc("2027-11-07T01:30", "America/New_York"), /occurs twice/);
  assert.throws(() => localToUtc("2027-01-01T00:00", "Asia/Tokyo"));
});

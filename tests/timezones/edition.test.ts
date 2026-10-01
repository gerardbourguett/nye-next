import assert from "node:assert/strict";
import test from "node:test";
import bundled from "../../data/timezones.json";
import { getRelayBands } from "../../data/relay";
import { editionTag, editionYear } from "../../lib/edition";

test("edition holds through the whole midnight wave, then hands off", () => {
  assert.equal(editionYear(Date.parse("2026-10-01T00:00:00Z")), 2027);
  assert.equal(editionYear(Date.parse("2026-12-31T10:00:00Z")), 2027, "first midnight (UTC+14)");
  assert.equal(editionYear(Date.parse("2027-01-01T00:00:00Z")), 2027);
  assert.equal(editionYear(Date.parse("2027-01-01T11:59:59.999Z")), 2027, "UTC−12 not yet crossed");
  assert.equal(editionYear(Date.parse("2027-01-01T12:00:00Z")), 2028);
  assert.equal(editionYear(Date.parse("2027-07-01T00:00:00Z")), 2028);
  assert.equal(editionTag(2028), "#2028Live");
});

test("every bundled crossing into an edition happens before it hands off", () => {
  for (const year of [2027, 2028]) {
    const bands = getRelayBands(year, bundled.zones);
    assert.ok(bands.length > 0);
    for (const band of bands) assert.equal(editionYear(Date.parse(band.arrivalUtc)), year, band.offsetLabel);
    assert.equal(editionYear(Date.parse(bands[0].arrivalUtc) - 1), year, "run-up already belongs to the edition");
  }
});

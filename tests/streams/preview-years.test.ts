import assert from "node:assert/strict";
import test from "node:test";
import { editionYear } from "../../lib/edition";
import { MAX_EDITION_YEAR, MIN_EDITION_YEAR, parseEditionYear, parseSimulation } from "../../lib/relay-clock";

test("every instant a preview accepts has an edition whose share image can be requested", () => {
  const first = parseSimulation("2000-01-01T00:00:00Z", "1");
  const last = parseSimulation("2100-12-31T23:59:59Z", "1");
  assert.ok(first && last, "both ends are valid previews");
  for (const simulation of [first, last]) {
    assert.equal(parseEditionYear(String(editionYear(simulation.at))), editionYear(simulation.at));
  }
  // The case that was refused: from noon UTC on 1 January 2100 the edition is 2101.
  const edge = parseSimulation("2100-01-01T12:00:00Z", "1");
  assert.equal(edge && editionYear(edge.at), 2101);
  assert.equal(MAX_EDITION_YEAR, 2101);
  assert.equal(MIN_EDITION_YEAR, 2000);
});

test("only four-digit editions inside those bounds are accepted", () => {
  assert.equal(parseEditionYear("2027"), 2027);
  for (const bad of [null, "", "abc", "1999", "2102", "20270", "2027.5", " 2027", "2027 ", "+2027", "-2027"]) {
    assert.equal(parseEditionYear(bad), null, String(bad));
  }
});

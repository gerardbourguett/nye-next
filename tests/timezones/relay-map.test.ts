import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getRelayBands } from "../../data/relay";
import map from "../../data/map-offsets.json";

test("every crossing has a region on the map, and the map draws nothing unexplained", () => {
  const mapped = new Set(map.offsets);
  const bands = getRelayBands(2027);
  assert.deepEqual(bands.filter((band) => !mapped.has(band.offsetMinutes)).map((band) => band.offsetLabel), [],
    "rerun scripts/generate-map-data.ts after catalog or source changes");
  const listed = new Set(bands.map((band) => band.offsetMinutes));
  // UTC−12 is only uninhabited Baker and Howland Islands: drawn, never listed.
  assert.deepEqual(map.offsets.filter((offset) => !listed.has(offset)), [-720]);
});

test("the static map has one layer per listed offset and a sane crop", () => {
  const svg = readFileSync("public/maps/time-zones.svg", "utf8");
  for (const offset of map.offsets) assert.match(svg, new RegExp(`<g id="o${offset}">`), String(offset));
  const [x, y, width, height] = map.viewBox;
  assert.ok(width > 1000 && height > 500 && x > -50 && y > -50, map.viewBox.join(" "));
  assert.match(map.source, /public domain/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { getRelayBands } from "../../data/relay";
import { formatRemaining, MAX_SPEED, parseSimulation, readClock, simulationHref } from "../../lib/relay-clock";
import { cityFromZoneName } from "../../lib/zones";

test("each crossing headlines its best-known place, by zone rather than offset", () => {
  const bands = getRelayBands(2027);
  const headline = (offset: number) => bands.find((band) => band.offsetMinutes === offset)?.headline.city;
  assert.equal(headline(660), "Sydney", "Sydney is on summer time at New Year");
  assert.equal(headline(540), "Tokyo");
  assert.equal(headline(-300), "New York");
  assert.equal(headline(-210), "St. John's");
  for (const band of bands) {
    assert.ok(band.places.includes(band.headline), band.offsetLabel);
    const cities = band.places.map((place) => place.city);
    assert.deepEqual(cities, [...cities].sort((a, b) => a.localeCompare(b)), "places stay sorted by city");
  }
  const synthetic = [{ zoneName: "Asia/Kathmandu", countryCode: "NP", countryName: "Nepal" }];
  assert.equal(getRelayBands(2027, synthetic)[0].headline.zoneName, "Asia/Kathmandu", "falls back to the only place");
});

test("simulation parsing accepts ISO instants and bounded integer speeds only", () => {
  assert.deepEqual(parseSimulation("2026-12-31T10:00:00Z", "60"), { at: Date.UTC(2026, 11, 31, 10), speed: 60 });
  assert.deepEqual(parseSimulation("2026-12-31T10:00:00Z", undefined), { at: Date.UTC(2026, 11, 31, 10), speed: 1 });
  assert.equal(parseSimulation("2026-12-31T10:00:00Z", "9999")?.speed, MAX_SPEED);
  assert.equal(parseSimulation("2026-12-31T10:00:00Z", "0")?.speed, 1);
  assert.equal(parseSimulation("2026-12-31T10:00:00Z", "1.5")?.speed, 1);
  for (const at of [undefined, "", "tomorrow", "1999-12-31T00:00:00Z", "2101-01-01T00:00:00Z", ["2026-12-31T10:00:00Z"], "2026-13-40T99:00:00Z"]) {
    assert.equal(parseSimulation(at, "60"), null, String(at));
  }
});

test("the clock advances from the simulated instant at its speed", () => {
  const simulation = { at: Date.UTC(2026, 11, 31, 10), speed: 60 };
  assert.equal(readClock(simulation, 1_000, 1_000), simulation.at);
  assert.equal(readClock(simulation, 1_000, 61_000), simulation.at + 3_600_000);
  assert.equal(readClock(null, 1_000, 61_000), 61_000);
  assert.equal(simulationHref(simulation.at, 60), "/road-to?at=2026-12-31T10%3A00%3A00.000Z&speed=60");
});

test("remaining time formats with days and clamps at zero", () => {
  assert.equal(formatRemaining(0), "00:00:00");
  assert.equal(formatRemaining(-5_000), "00:00:00");
  assert.equal(formatRemaining(1), "00:00:01", "rounds up, never shows zero early");
  assert.equal(formatRemaining(3_723_000), "01:02:03");
  assert.equal(formatRemaining(90_061_000), "1d 01:01:01");
  assert.equal(cityFromZoneName("America/Sao_Paulo"), "São Paulo");
});

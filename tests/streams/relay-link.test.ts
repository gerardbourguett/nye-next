import assert from "node:assert/strict";
import test from "node:test";
import { getRelayBands } from "../../data/relay";
import type { Slot, StreamOption } from "../../lib/streams/domain";
import { crossingStreams, editionStreamWindow, watchHref } from "../../lib/streams/relay-link";

const sydney: StreamOption = { provider: "youtube_channel", id: "UCabcdefghijklmnopqrstuv", label: "Harbour fireworks", zone: "Australia/Sydney" };
const santiago: StreamOption = { provider: "twitch", id: "vanderfondi", label: "Santiago", zone: "America/Santiago" };
const studio: StreamOption = { provider: "twitch", id: "studio_cam", label: "Studio" };
const slot = (id: string, starts_at: string, options: StreamOption[], published = true): Slot => ({
  id: `11111111-1111-4111-8111-${id.padStart(12, "0")}`, title: `Slot ${id}`, published, starts_at,
  ends_at: new Date(Date.parse(starts_at) + 3_600_000).toISOString(), options,
});

test("placed streams land on the crossing their place observes at New Year", () => {
  const slots = [
    slot("1", "2026-12-31T12:00:00.000Z", [sydney, studio]),
    slot("2", "2027-01-01T02:00:00.000Z", [santiago]),
  ];
  const streams = crossingStreams(slots, 2027);
  // Sydney is on summer time (+11:00) and Santiago on −03:00 at New Year.
  assert.deepEqual(Object.keys(streams).map(Number).sort((a, b) => a - b), [-180, 660]);
  assert.equal(streams[660][0].label, "Harbour fireworks");
  assert.equal(streams[660][0].city, "Sydney");
  assert.equal(streams[-180][0].key, "twitch:vanderfondi");
  const bandOffsets = new Set(getRelayBands(2027).map((band) => band.offsetMinutes));
  for (const offset of Object.keys(streams)) assert.ok(bandOffsets.has(Number(offset)), offset);
});

test("drafts, other editions, unplaced and unsupported places are left out", () => {
  const { from, to } = editionStreamWindow(2027);
  const slots = [
    slot("1", "2026-12-31T12:00:00.000Z", [sydney], false),
    slot("2", new Date(from - 3_600_000).toISOString(), [sydney]),
    slot("3", new Date(to).toISOString(), [sydney]),
    slot("4", "2026-12-31T13:00:00.000Z", [studio, { ...santiago, zone: "Unsupported/Zone" }]),
  ];
  assert.deepEqual(crossingStreams(slots, 2027), {});
  assert.deepEqual(Object.keys(crossingStreams([slot("5", new Date(from).toISOString(), [sydney])], 2027)), ["660"]);
});

test("a long slot that starts before the window but overlaps it is included", () => {
  const { from } = editionStreamWindow(2027);
  const rehearsal = { ...slot("6", new Date(from - 3 * 86_400_000).toISOString(), [sydney]),
    ends_at: new Date(from + 3_600_000).toISOString() };
  assert.deepEqual(Object.keys(crossingStreams([rehearsal], 2027)), ["660"]);
  const endsAtWindow = { ...rehearsal, ends_at: new Date(from).toISOString() };
  assert.deepEqual(crossingStreams([endsAtWindow], 2027), {});
});

test("a crossing lists its streams by start time, then label", () => {
  const melbourne = { ...sydney, id: "UCzzzzzzzzzzzzzzzzzzzzzz", label: "Melbourne", zone: "Australia/Melbourne" };
  const streams = crossingStreams([
    slot("2", "2026-12-31T13:00:00.000Z", [sydney]),
    slot("1", "2026-12-31T12:00:00.000Z", [sydney, melbourne]),
  ], 2027);
  assert.deepEqual(streams[660].map((item) => `${item.slotId.slice(-1)}:${item.label}`),
    ["1:Harbour fireworks", "1:Melbourne", "2:Harbour fireworks"]);
  assert.equal(watchHref(streams[660][0]), `/watch?slot=${streams[660][0].slotId}&stream=youtube_channel%3AUCabcdefghijklmnopqrstuv`);
});

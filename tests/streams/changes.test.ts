import assert from "node:assert/strict";
import test from "node:test";
import { decodeChanges, describeChange } from "../../lib/streams/changes";

const slot = { title: "Opening", starts_at: "2030-12-31T23:00:00Z", ends_at: "2031-01-01T00:00:00Z", published: false, options: [{ provider: "twitch", id: "vanderfondi", label: "Main" }] };

test("changes read as plain sentences", () => {
  assert.equal(describeChange("insert", null, slot), "Created as a draft");
  assert.equal(describeChange("insert", null, { ...slot, published: true }), "Created and published");
  assert.equal(describeChange("delete", { ...slot, published: true }, null), "Deleted (it was published)");
  assert.equal(describeChange("delete", slot, null), "Deleted");
  assert.equal(describeChange("update", slot, { ...slot, published: true }), "Published");
  assert.equal(describeChange("update", { ...slot, published: true }, slot), "Unpublished");
  assert.equal(describeChange("update", slot, { ...slot, title: "Opening night" }), "Changed title");
  assert.equal(describeChange("update", slot, { ...slot, title: "x", ends_at: "2031-01-01T01:00:00Z" }), "Changed title and time");
  assert.equal(describeChange("update", slot, { ...slot, published: true, title: "x", options: [] }), "Published; changed title and streams");
  assert.equal(describeChange("update", slot, null), "Changed");
});

test("rows that are not shaped as expected are left out, not guessed at", () => {
  const good = { id: 7, changed_at: "2030-12-01T10:00:00Z", changed_by: "11111111-1111-4111-8111-111111111111", operation: "update", slot_id: "22222222-2222-4222-8222-222222222222", before: slot, after: { ...slot, published: true } };
  const [change] = decodeChanges([good, null, { ...good, id: "8" }, { ...good, operation: "truncate" }, { ...good, slot_id: "nope" }, { ...good, changed_at: "yesterday" }]);
  assert.equal(decodeChanges([good, null, { ...good, id: "8" }, { ...good, operation: "truncate" }, { ...good, slot_id: "nope" }, { ...good, changed_at: "yesterday" }]).length, 1);
  assert.deepEqual(change, { id: 7, changedAt: "2030-12-01T10:00:00Z", changedBy: good.changed_by, operation: "update", slotId: good.slot_id, title: "Opening", summary: "Published" });
  assert.equal(decodeChanges("nope").length, 0);
  assert.equal(decodeChanges([{ ...good, changed_by: null }])[0].changedBy, null);
  assert.equal(decodeChanges([{ ...good, changed_by: "not-a-uuid" }])[0].changedBy, null);
});

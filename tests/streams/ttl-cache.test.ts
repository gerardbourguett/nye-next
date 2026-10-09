import assert from "node:assert/strict";
import test from "node:test";
import { ttlCache } from "../../lib/ttl-cache";

test("callers within the lifetime share one load, and a later caller reloads", async () => {
  let time = 1_000;
  let loads = 0;
  const get = ttlCache(async (key: string) => `${key}:${++loads}`, 30_000, () => time);
  const [a, b] = await Promise.all([get("x"), get("x")]);
  assert.deepEqual([a, b, loads], ["x:1", "x:1", 1]);
  time += 29_999;
  assert.equal(await get("x"), "x:1");
  time += 2;
  assert.equal(await get("x"), "x:2");
  assert.equal(await get("y"), "y:3", "another key loads on its own");
});

test("a failure is not remembered: the next caller tries again", async () => {
  let calls = 0;
  const get = ttlCache(async () => { if (++calls === 1) throw new Error("down"); return "up"; }, 30_000);
  await assert.rejects(get("k"), /down/);
  assert.equal(await get("k"), "up");
  assert.equal(await get("k"), "up");
  assert.equal(calls, 2);
});

test("the cache stays bounded", async () => {
  let loads = 0;
  const get = ttlCache(async (key: number) => { loads++; return key; }, 30_000, Date.now, 2);
  await get(1); await get(2); await get(3);
  await get(1);
  assert.equal(loads, 4, "the oldest key was dropped to stay within two entries");
});

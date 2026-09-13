import assert from "node:assert/strict";
import test from "node:test";
import { authorizeAdmin } from "../../lib/streams/authorization";

test("missing or failed verified identity is denied before membership lookup", async () => {
  for (const identity of [{ userId: null, error: false }, { userId: "claimed-admin", error: true }]) {
    let called = false;
    assert.equal(await authorizeAdmin(async () => identity, async () => {
      called = true; return { userId: "claimed-admin", error: false };
    }), "unauthenticated");
    assert.equal(called, false);
  }
});

test("a valid Auth user is not automatically an admin", async () => {
  assert.equal(await authorizeAdmin(async () => ({ userId: "visitor", error: false }), async (id) => {
    assert.equal(id, "visitor"); return { userId: null, error: false };
  }), "forbidden");
});

test("membership must match the server-verified identity exactly", async () => {
  const identity = async () => ({ userId: "admin-a", error: false });
  assert.equal(await authorizeAdmin(identity, async () => ({ userId: "admin-b", error: false })), "forbidden");
  assert.equal(await authorizeAdmin(identity, async () => ({ userId: "admin-a", error: false })), "admin");
});

test("membership failures and thrown network failures fail closed", async () => {
  const identity = async () => ({ userId: "admin-a", error: false });
  assert.equal(await authorizeAdmin(identity, async () => ({ userId: "admin-a", error: true })), "unavailable");
  assert.equal(await authorizeAdmin(identity, async () => { throw new Error("offline"); }), "unavailable");
  assert.equal(await authorizeAdmin(async () => { throw new Error("offline"); }, async () => ({ userId: "admin-a", error: false })), "unavailable");
});

test("membership revocation is checked anew on the next call, without an authorization cache", async () => {
  let member = true;
  const identity = async () => ({ userId: "admin-a", error: false });
  const lookup = async () => ({ userId: member ? "admin-a" : null, error: false });
  assert.equal(await authorizeAdmin(identity, lookup), "admin");
  member = false;
  assert.equal(await authorizeAdmin(identity, lookup), "forbidden");
});

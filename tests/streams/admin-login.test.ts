import assert from "node:assert/strict";
import test from "node:test";
import { runAdminLogin, type LoginGateway } from "../../lib/streams/admin-login";
import type { Access } from "../../lib/streams/authorization";

const credentials = { email: "existing-user@example.test", password: "test-only-password" };

function gatewayWith(access: Access | "setup", overrides: Partial<LoginGateway> = {}) {
  const calls: string[] = [];
  const gateway: LoginGateway = {
    signIn: async (received) => {
      calls.push("signIn");
      assert.deepEqual(received, credentials);
      return { error: false };
    },
    checkAccess: async () => { calls.push("checkAccess"); return access; },
    signOut: async () => { calls.push("signOut"); return { error: false }; },
    ...overrides,
  };
  return { calls, gateway };
}

test("login orchestration succeeds only after password authentication and admin verification", async () => {
  const { gateway, calls } = gatewayWith("admin");
  const result = await runAdminLogin(credentials, async () => gateway);
  assert.equal(result.ok, true);
  assert.equal(result.code, "admin");
  assert.deepEqual(calls, ["signIn", "checkAccess"]);
});

test("credential rejection stays generic and never probes membership", async () => {
  const { gateway, calls } = gatewayWith("admin", { signIn: async () => ({ error: true }) });
  const result = await runAdminLogin(credentials, async () => gateway);
  assert.equal(result.ok, false);
  assert.equal(result.code, "credentials");
  assert.equal(result.message, "Unable to sign in. Check your email and password or contact the site owner.");
  assert.deepEqual(calls, []);
  assert.doesNotMatch(result.message, /membership|unconfirmed|not found/i);
});

test("missing configuration is distinct and performs no authentication", async () => {
  const result = await runAdminLogin(credentials, async () => null);
  assert.equal(result.ok, false);
  assert.equal(result.code, "setup");
  assert.match(result.message, /environment configuration/);
});

test("malformed credentials are rejected without constructing an auth client", async () => {
  for (const input of [{ ...credentials, email: "" }, { ...credentials, password: "" },
    { ...credentials, email: "a".repeat(255) }, { ...credentials, password: "a".repeat(1025) }]) {
    let constructed = false;
    const result = await runAdminLogin(input, async () => { constructed = true; return null; });
    assert.equal(result.ok, false);
    assert.equal(result.code, "credentials");
    assert.equal(constructed, false);
  }
});

test("verified missing membership directs the owner to grant the existing user, then cleans up", async () => {
  const { gateway, calls } = gatewayWith("forbidden");
  const result = await runAdminLogin(credentials, async () => gateway);
  assert.equal(result.ok, false);
  assert.equal(result.code, "membership_missing");
  assert.match(result.message, /existing user access in public\.stream_admins/);
  assert.match(result.message, /No new account is needed/);
  assert.deepEqual(calls, ["signIn", "checkAccess", "signOut"]);
  assert.equal(result.message.includes(credentials.email), false);
});

test("lookup errors suggest database checks without claiming membership is missing", async () => {
  const { gateway, calls } = gatewayWith("unavailable");
  const result = await runAdminLogin(credentials, async () => gateway);
  assert.equal(result.ok, false);
  assert.equal(result.code, "permissions_unavailable");
  assert.match(result.message, /check the database setup/);
  assert.doesNotMatch(result.message, /no admin membership/);
  assert.deepEqual(calls, ["signIn", "checkAccess", "signOut"]);
});

test("unverified sessions and configuration loss cannot fall back to authenticated-only access", async () => {
  for (const [access, code] of [["unauthenticated", "session_unverified"], ["setup", "setup"]] as const) {
    const { gateway, calls } = gatewayWith(access);
    const result = await runAdminLogin(credentials, async () => gateway);
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.deepEqual(calls, ["signIn", "checkAccess", "signOut"]);
  }
});

test("thrown permission errors are sanitized and still clean up the unauthorized session", async () => {
  const { gateway, calls } = gatewayWith("admin", {
    checkAccess: async () => { throw new Error("private provider detail"); },
  });
  const result = await runAdminLogin(credentials, async () => gateway);
  assert.equal(result.ok, false);
  assert.equal(result.code, "permissions_unavailable");
  assert.doesNotMatch(result.message, /private provider detail/);
  assert.deepEqual(calls, ["signIn", "signOut"]);
});

test("auth transport and client construction exceptions do not expose raw errors or grant access", async () => {
  const { gateway, calls } = gatewayWith("admin", {
    signIn: async () => { throw new Error("private provider detail"); },
  });
  for (const create of [async () => gateway, async () => { throw new Error("private provider detail"); }]) {
    const result = await runAdminLogin(credentials, create);
    assert.equal(result.ok, false);
    assert.equal(result.code, "authentication_unavailable");
    assert.doesNotMatch(result.message, /private provider detail/);
  }
  assert.deepEqual(calls, []);
});

test("returned and thrown sign-out failures remain denied and disclose only cleanup uncertainty", async () => {
  for (const access of ["forbidden", "unavailable", "unauthenticated", "setup"] as const) {
    for (const signOut of [async () => ({ error: true }), async () => { throw new Error("private cleanup detail"); }]) {
      const { gateway } = gatewayWith(access, { signOut });
      const result = await runAdminLogin(credentials, async () => gateway);
      assert.equal(result.ok, false);
      if (result.ok) assert.fail("Cleanup failure must never grant access");
      assert.equal(result.cleanupFailed, true);
      assert.match(result.message, /Session sign-out could not be confirmed/);
      assert.doesNotMatch(result.message, /private cleanup detail/);
    }
  }
});

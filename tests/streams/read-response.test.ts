import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import { PassThrough } from "node:stream";
import { readResponse } from "../../lib/streams/read-response";

/** A stand-in for an IncomingMessage: a stream with a status and headers. */
function fakeResponse(statusCode: number, headers: Record<string, string> = {}) {
  return Object.assign(new PassThrough(), { statusCode, headers }) as unknown as IncomingMessage & PassThrough;
}
const fakeRequest = () => {
  const destroyed: Error[] = [];
  return { destroy: (error?: Error) => { if (error) destroyed.push(error); }, destroyed };
};

test("a redirect is answered at once and its body is never read: the connection is closed", async () => {
  const response = fakeResponse(302, { location: "https://cdn.example.com/next.m3u8" });
  const request = fakeRequest();
  const answer = await readResponse(response, request, 1_024);
  assert.deepEqual(answer, { status: 302, location: "https://cdn.example.com/next.m3u8", text: "" });
  assert.equal(response.destroyed, true, "closed, not drained");
  // An endless body after the redirect goes nowhere.
  response.write("x".repeat(10_000));
  assert.equal(response.destroyed, true);
});

test("a body is returned whole under the cap", async () => {
  const response = fakeResponse(200);
  const request = fakeRequest();
  const pending = readResponse(response, request, 1_024);
  response.write("#EXTM3U\n");
  response.end("#EXT-X-ENDLIST\n");
  assert.deepEqual(await pending, { status: 200, text: "#EXTM3U\n#EXT-X-ENDLIST\n" });
  assert.deepEqual(request.destroyed, []);
});

test("a body over the cap rejects and closes the connection", async () => {
  const response = fakeResponse(200);
  const request = fakeRequest();
  const pending = readResponse(response, request, 100);
  response.write("x".repeat(60));
  response.write("x".repeat(60));
  await assert.rejects(pending, /too large/);
  assert.equal(request.destroyed.length, 1);
  assert.equal(response.destroyed, true);
});

test("an error or a connection that closes early rejects instead of hanging", async () => {
  const errored = fakeResponse(200);
  const failing = readResponse(errored, fakeRequest(), 100);
  errored.destroy(new Error("reset"));
  await assert.rejects(failing, /reset/);

  const cut = fakeResponse(200);
  const early = readResponse(cut, fakeRequest(), 100);
  cut.write("partial");
  cut.destroy();
  await assert.rejects(early, /closed before/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { compareVersions, IANA_SOURCE, isCatalog } from "../../supabase/functions/_shared/catalog";
import { fetchCatalog, MAX_COMPRESSED, MAX_EXPANDED, parseCatalog, parseTar, readBounded } from "../../supabase/functions/_shared/iana";
import { sourceFiles, tar } from "./fixtures";

function repairChecksum(bytes: Uint8Array) {
  bytes.fill(32, 148, 156);
  const sum = bytes.subarray(0, 512).reduce((total, b) => total + b, 0);
  bytes.set(new TextEncoder().encode(sum.toString(8).padStart(6, "0") + "\0 "), 148);
  return bytes;
}

test("version-coherent ustar parsing and official alias keep the old city label", () => {
  const result = parseCatalog(parseTar(tar()), [{ zoneName: "Synthetic/Old_Place", countryCode: "AA", countryName: "Existing label" }]);
  assert.equal(result.version, "2026d");
  assert.equal(result.source, IANA_SOURCE);
  assert.equal(result.zones.length, 351);
  assert.equal(result.zones.find((z) => z.zoneName === "Synthetic/Old_Place")?.countryName, "Existing label");
  assert.ok(isCatalog(result));
});

test("backward #= metadata proves a country-specific alias despite a consolidated target", () => {
  const files = sourceFiles();
  files.set("backward", "Link Synthetic/Place_0 Synthetic/Place_1\nLink Synthetic/Place_0 Synthetic/Old_Place #= Synthetic/Place_1\n");
  const result = parseCatalog(files, [{ zoneName: "Synthetic/Old_Place", countryCode: "AB", countryName: "Existing label" }]);
  assert.equal(result.zones.find((z) => z.zoneName === "Synthetic/Old_Place")?.countryCode, "AB");
  files.set("backward", "Link Synthetic/Place_0 Synthetic/Old_Place #= Synthetic/Place_1\n");
  assert.throws(() => parseCatalog(files, [{ zoneName: "Synthetic/Old_Place", countryCode: "AB", countryName: "Existing" }]), /coverage_loss/);
});

for (const [label, zoneName, countryCode] of [
  ["unknown alias", "Synthetic/Unknown", "AA"],
  ["country remap", "Synthetic/Place_0", "AB"],
] as const) {
  test(`coverage gate rejects ${label}`, () => {
    assert.throws(() => parseCatalog(sourceFiles(), [{ zoneName, countryCode, countryName: "Existing" }]), /coverage_loss/);
  });
}

test("rejects alias loops, missing countries, duplicate zones and consolidated catalog", () => {
  let files = sourceFiles();
  files.set("backward", "Link Synthetic/B Synthetic/A\nLink Synthetic/A Synthetic/B");
  assert.throws(() => parseCatalog(files, []), /alias_invalid/);
  files = sourceFiles(); files.set("iso3166.tab", "ZZ\tSynthetic");
  assert.throws(() => parseCatalog(files, []), /catalog_invalid/);
  files = sourceFiles(); files.set("zone.tab", files.get("zone.tab")! + "\nAA\t+0000+00000\tSynthetic/Place_0");
  assert.throws(() => parseCatalog(files, []), /catalog_invalid/);
  files = sourceFiles(); files.set("zone.tab", "AA\t+0000+00000\tSynthetic/Place_0");
  assert.throws(() => parseCatalog(files, []), /catalog_invalid/);
});

test("validates IANA release syntax and release order beyond z", () => {
  assert.ok(compareVersions("2026za", "2026z") > 0);
  assert.ok(compareVersions("2027a", "2026zza") > 0);
  assert.ok(compareVersions("2026d", "2026e") < 0);
  for (const version of ["latest", "2026ab", "2026D", "2026d\n2026e", "1999a"]) {
    const files = sourceFiles(); files.set("version", version);
    assert.throws(() => parseCatalog(files, []), /version_invalid/);
  }
});

test("ustar rejects bad checksum, missing files, traversal, links, truncation and size limits", () => {
  const damaged = tar(); damaged[10] ^= 1;
  assert.throws(() => parseTar(damaged), /archive_invalid/);
  const missing = sourceFiles(); missing.delete("version");
  assert.throws(() => parseTar(tar(missing)), /archive_missing_files/);
  assert.throws(() => parseTar(tar(new Map([["../version", "2026d"]]))), /archive_invalid/);
  assert.throws(() => parseTar(tar().slice(0, -1024)), /archive_invalid/);
  assert.throws(() => parseTar(new Uint8Array(MAX_EXPANDED + 1)), /archive_invalid/);
  const link = tar(); link[156] = 50;
  assert.throws(() => parseTar(repairChecksum(link)), /archive_invalid/);
  assert.throws(() => parseTar(tar(new Map([["version", "x".repeat(1_000_001)]]))), /archive_invalid/);
});

test("ustar rejects unsupported magic/prefix, duplicate members, invalid UTF-8 and excessive members", () => {
  const magic = tar(); magic[257] = 0;
  assert.throws(() => parseTar(repairChecksum(magic)), /archive_invalid/);
  const prefix = tar(); prefix[345] = 65;
  assert.throws(() => parseTar(repairChecksum(prefix)), /archive_invalid/);
  const original = tar();
  const duplicate = Buffer.concat([original.subarray(0, 1024), original]);
  assert.throws(() => parseTar(duplicate), /archive_invalid/);
  const invalidText = tar(); invalidText[512] = 255;
  assert.throws(() => parseTar(invalidText), /encoded data|encoding/i);
  const files = sourceFiles();
  for (let i = 0; i < 100; i++) files.set(`extra-${i}`, "synthetic");
  assert.throws(() => parseTar(tar(files)), /archive_invalid/);
});

test("stream bounds enforce bytes and timeout, including dishonest headers", async () => {
  await assert.rejects(readBounded(new Blob(["12345"]).stream(), 4, AbortSignal.timeout(1000)), /size_limit/);
  await assert.rejects(readBounded(new ReadableStream({ start() {} }), 10, AbortSignal.timeout(20)), /timeout/i);
});

function upstream(body: Uint8Array, url = IANA_SOURCE, status = 200): typeof fetch {
  return async (input, init) => {
    assert.equal(input, IANA_SOURCE);
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    const response = new Response(body as BodyInit, { status, headers: { "Content-Length": "1" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
}

test("fetch pipeline parses gzip without filesystem extraction", async () => {
  const result = await fetchCatalog([], upstream(gzipSync(tar())));
  assert.equal(result.zones.length, 350);
});

test("fetch pipeline rejects incorrect provenance, HTML, bad gzip and oversized bodies", async () => {
  await assert.rejects(fetchCatalog([], upstream(gzipSync(tar()), "https://example.com/archive")), /upstream_unavailable/);
  await assert.rejects(fetchCatalog([], upstream(new TextEncoder().encode("<html>not data</html>"))));
  await assert.rejects(fetchCatalog([], upstream(new Uint8Array(MAX_COMPRESSED + 1))), /size_limit/);
  await assert.rejects(fetchCatalog([], upstream(gzipSync(new Uint8Array(MAX_EXPANDED + 1)))), /size_limit/);
  await assert.rejects(fetchCatalog([], upstream(new Uint8Array(), IANA_SOURCE, 503)), /upstream_unavailable/);
});

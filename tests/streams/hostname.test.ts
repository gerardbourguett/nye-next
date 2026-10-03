import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress, isPublicHostname, isPublicHttpsUrl } from "../../lib/streams/hostname";

test("public host names: dotted, lower-case labels only", () => {
  for (const host of ["cdn.example.com", "A.B.Example.CO.UK", "xn--bcher-kva.example", "live-1.example.tv", "cdn.example.com."]) {
    assert.equal(isPublicHostname(host), true, host);
  }
});

test("IP literals, single labels and internal suffixes are not public host names", () => {
  for (const host of ["127.0.0.1", "10.0.0.5", "8.8.8.8", "0.0.0.0", "[::1]", "::1", "localhost", "LOCALHOST", "tv", "printer.local",
    "app.internal", "nas.home.arpa", "box.lan", "a.localhost", "", ".example.com", "a..example.com", "-a.example.com", "a-.example.com",
    "exa mple.com", "ex_ample.example.com", `${"a".repeat(64)}.example.com`]) {
    assert.equal(isPublicHostname(host), false, host);
  }
});

test("addresses: loopback, private, link-local, carrier-grade NAT, multicast and documentation ranges are refused", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1", "203.0.113.9", "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1",
    "2001:db8::1", "fec0::1", "2001::1", "2001:2::1", "2001:10::1", "3fff::1", "4000::1", "8000::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::7f00:1", "64:ff9b::a00:1", "2002:c0a8:101::1", "not an address", "1.2.3", "1.2.3.256"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test("addresses: ordinary public ones pass", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test("public HTTPS URLs: HTTPS, no credentials, public host, ordinary port", () => {
  assert.equal(isPublicHttpsUrl(new URL("https://cdn.example.com/a.m3u8")), true);
  assert.equal(isPublicHttpsUrl(new URL("https://cdn.example.com:8443/a.m3u8")), true);
  for (const url of ["http://cdn.example.com/", "https://u:p@cdn.example.com/", "https://u@cdn.example.com/", "https://cdn.example.com:22/",
    "https://127.0.0.1/", "https://0x7f.1/", "https://2130706433/", "https://[::1]/", "ftp://cdn.example.com/"]) {
    assert.equal(isPublicHttpsUrl(new URL(url)), false, url);
  }
});

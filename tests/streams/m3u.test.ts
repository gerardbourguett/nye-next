import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LISTED_CHANNELS, parseM3u } from "../../lib/streams/m3u";

const LIST = `﻿#EXTM3U x-tvg-url="https://epg.example.com/guide.xml"
#EXTINF:-1 tvg-id="a" tvg-name="Alpha" group-title="News, World",Alpha, The Channel
https://cdn.example.com/alpha/index.m3u8
#EXTVLCOPT:http-user-agent=Test
#EXTINF:-1 group-title="Sports",Beta
https://cdn.example.com/beta/manifest.mpd?token=abc
#EXTINF:-1,Gamma Page
https://tv.example.com/gamma
#EXTINF:-1,Plain HTTP
http://cdn.example.com/delta.m3u8
#EXTINF:-1,By IP
https://203.0.114.7/live/echo.m3u8
#EXTINF:-1,Alpha again
https://cdn.example.com/alpha/index.m3u8
#EXTINF:-1 tvg-name="Named only",
https://cdn.example.com/named.m3u8
https://cdn.example.com/bare.m3u8
`;

test("channel lists: names, groups, and what the room can do with each entry", () => {
  const { channels, isStream } = parseM3u(LIST);
  assert.equal(isStream, false);
  assert.deepEqual(channels.map((channel) => [channel.name, channel.provider]), [
    ["Alpha, The Channel", "hls"], ["Beta", "dash"], ["Gamma Page", "link"], ["Plain HTTP", null], ["By IP", null],
    ["Named only", "hls"], ["https://cdn.example.com/bare.m3u8", "hls"],
  ]);
  assert.equal(channels[0].group, "News, World");
  assert.equal(channels[1].group, "Sports");
  assert.match(channels[2].note ?? "", /only be opened in a new tab/);
  assert.match(channels[3].note ?? "", /Plain HTTP/);
  assert.match(channels[4].note ?? "", /public host name/);
  assert.equal(channels.some((channel) => channel.name === "Alpha again"), false, "duplicate addresses are listed once");
});

test("relative entries resolve against the list's address", () => {
  const { channels } = parseM3u("#EXTM3U\n#EXTINF:-1,Rel\nlive/a.m3u8\n", "https://cdn.example.com/lists/all.m3u");
  assert.equal(channels[0].url, "https://cdn.example.com/lists/live/a.m3u8");
  assert.equal(channels[0].provider, "hls");
});

test("a stream playlist is recognised as a stream, not a list; other text yields nothing", () => {
  assert.deepEqual(parseM3u("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg1.ts\n").isStream, true);
  assert.deepEqual(parseM3u("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8\n").isStream, true);
  assert.deepEqual(parseM3u("hello world"), { channels: [], isStream: false });
  assert.deepEqual(parseM3u(""), { channels: [], isStream: false });
});

test("lists are capped, and over-long names are trimmed", () => {
  const big = "#EXTM3U\n" + Array.from({ length: MAX_LISTED_CHANNELS + 50 }, (_, index) => `#EXTINF:-1,C${index}\nhttps://cdn.example.com/${index}.m3u8`).join("\n");
  assert.equal(parseM3u(big).channels.length, MAX_LISTED_CHANNELS);
  const long = parseM3u(`#EXTM3U\n#EXTINF:-1,${"n".repeat(300)}\nhttps://cdn.example.com/a.m3u8`);
  assert.equal(long.channels[0].name.length, 120);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { StreamOption } from "../../lib/streams/domain";
import { playlistStatus, type FetchText } from "../../lib/streams/playlist-status";

const hls: StreamOption = { provider: "hls", id: "https://cdn.example.com/live/master.m3u8", label: "Feed" };
const dash: StreamOption = { provider: "dash", id: "https://cdn.example.com/live/manifest.mpd", label: "Feed" };
const MEDIA_LIVE = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:9\n#EXTINF:6,\nseg9.ts\n";
const MEDIA_ENDED = MEDIA_LIVE + "#EXT-X-ENDLIST\n";
const MASTER = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhigh/index.m3u8\n";

/** A fake network: answers by address, remembering what was asked. */
function network(answers: Record<string, { status: number; text?: string; url?: string }>) {
  const asked: string[] = [];
  const fetchText: FetchText = async (url) => {
    asked.push(url);
    const answer = answers[url];
    if (!answer) throw new Error(`unexpected ${url}`);
    return { status: answer.status, text: answer.text ?? "", url: answer.url ?? url };
  };
  return { fetchText, asked };
}

test("a media playlist is live until it ends; the stream's own 404/410 means offline", async () => {
  const live = network({ [hls.id]: { status: 200, text: MEDIA_LIVE } });
  assert.deepEqual(await playlistStatus(hls, live.fetchText), { live: true });
  assert.equal(await playlistStatus(hls, network({ [hls.id]: { status: 200, text: MEDIA_ENDED } }).fetchText), null, "a recording is not live, nor offline");
  assert.deepEqual(await playlistStatus(hls, network({ [hls.id]: { status: 404 } }).fetchText), { live: false });
  assert.deepEqual(await playlistStatus(hls, network({ [hls.id]: { status: 410 } }).fetchText), { live: false });
  for (const status of [403, 500, 302]) assert.equal(await playlistStatus(hls, network({ [hls.id]: { status } }).fetchText), null, String(status));
  assert.equal(await playlistStatus(hls, network({ [hls.id]: { status: 200, text: "<html>" } }).fetchText), null);
});

test("a master playlist is judged by its first rendition, which can only confirm, never deny, the stream", async () => {
  const base = "https://cdn.example.com/live/";
  const live = network({ [hls.id]: { status: 200, text: MASTER }, [`${base}low/index.m3u8`]: { status: 200, text: MEDIA_LIVE } });
  assert.deepEqual(await playlistStatus(hls, live.fetchText), { live: true });
  assert.deepEqual(live.asked, [hls.id, `${base}low/index.m3u8`]);
  // One rendition missing (404/410) does not make the whole stream offline: another may be live.
  for (const status of [404, 410]) {
    const partial = network({ [hls.id]: { status: 200, text: MASTER }, [`${base}low/index.m3u8`]: { status } });
    assert.equal(await playlistStatus(hls, partial.fetchText), null, String(status));
  }
  const ended = network({ [hls.id]: { status: 200, text: MASTER }, [`${base}low/index.m3u8`]: { status: 200, text: MEDIA_ENDED } });
  assert.equal(await playlistStatus(hls, ended.fetchText), null);
});

test("relative renditions resolve against where the master really came from after a redirect", async () => {
  const moved = "https://edge.example.net/other/dir/master.m3u8";
  const net = network({
    [hls.id]: { status: 200, text: MASTER, url: moved },
    "https://edge.example.net/other/dir/low/index.m3u8": { status: 200, text: MEDIA_LIVE },
  });
  assert.deepEqual(await playlistStatus(hls, net.fetchText), { live: true });
  assert.equal(net.asked[1], "https://edge.example.net/other/dir/low/index.m3u8");
});

test("a master that points to another master is not followed forever", async () => {
  const net = network({ [hls.id]: { status: 200, text: MASTER }, "https://cdn.example.com/live/low/index.m3u8": { status: 200, text: MASTER } });
  assert.equal(await playlistStatus(hls, net.fetchText), null);
  assert.equal(net.asked.length, 2);
});

test("DASH: dynamic manifests are live, static ones and errors are unconfirmed, a missing manifest is offline", async () => {
  assert.deepEqual(await playlistStatus(dash, network({ [dash.id]: { status: 200, text: '<MPD type="dynamic"></MPD>' } }).fetchText), { live: true });
  assert.equal(await playlistStatus(dash, network({ [dash.id]: { status: 200, text: '<MPD type="static"></MPD>' } }).fetchText), null);
  assert.deepEqual(await playlistStatus(dash, network({ [dash.id]: { status: 404 } }).fetchText), { live: false });
});

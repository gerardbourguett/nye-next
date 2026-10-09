import assert from "node:assert/strict";
import test from "node:test";
import { activeSlot, decodeSlots, embedUrl, formatDuration, HOUR_MS, optionKey, overlaps, parseSelection, parseStreamSource, parseZone,
  providerName, providerUrl, reconcilePlayback, selectedOption, validateOptions, validateWindow, type PlaybackState, type Slot, type StreamOption } from "../../lib/streams/domain";

const twitch: StreamOption = { provider: "twitch", id: "vanderfondi", label: "Test channel" };
const youtube: StreamOption = { provider: "youtube", id: "M7lc1UVf-VE", label: "Test video" };
const slot: Slot = { id: "11111111-1111-4111-8111-111111111111", title: "Test only", published: true,
  starts_at: "2026-12-31T23:00:00.000Z", ends_at: "2027-01-01T00:00:00.000Z", options: [twitch, youtube] };

test("canonical Twitch URLs and channel IDs normalize to lowercase", () => {
  for (const source of ["Vanderfondi", "https://twitch.tv/Vanderfondi", "https://www.twitch.tv/vanderfondi/?ref=share"]) {
    assert.equal(parseStreamSource("twitch", source), "vanderfondi");
  }
});

test("YouTube IDs and supported URL shapes retain case", () => {
  for (const source of [youtube.id, `https://www.youtube.com/watch?v=${youtube.id}&t=10`, `https://youtu.be/${youtube.id}?si=test`,
    `https://youtube.com/live/${youtube.id}`, `https://m.youtube.com/shorts/${youtube.id}`, `https://youtube.com/embed/${youtube.id}`]) {
    assert.equal(parseStreamSource("youtube", source), youtube.id);
  }
});

test("reject host spoofing, credentials, ports, malformed URLs, and unsupported schemes", () => {
  for (const source of ["https://twitch.tv.evil.example/vanderfondi", "https://evil.example/twitch.tv/vanderfondi",
    "https://twitch.tv@evil.example/vanderfondi", "https://evil@twitch.tv/vanderfondi", "https://twitch.tv:123/vanderfondi",
    "http://twitch.tv/vanderfondi", "javascript:alert(1)", "data:text/html,test", "//twitch.tv/vanderfondi",
    "https://twitch.tv\\vanderfondi", "https://twitch.tv/van derfondi", "https://twitch.tv./vanderfondi"]) {
    assert.throws(() => parseStreamSource("twitch", source), source);
  }
  for (const source of [`https://youtube.com.evil.example/watch?v=${youtube.id}`, `https://youtu.be.evil.example/${youtube.id}`,
    `ftp://youtube.com/watch?v=${youtube.id}`, `https://user@youtube.com/watch?v=${youtube.id}`]) {
    assert.throws(() => parseStreamSource("youtube", source), source);
  }
});

test("reject invalid IDs, channel/playlist URLs, wrong provider, and arbitrary embed HTML", () => {
  for (const source of ["", "a".repeat(26), "channel-name", "https://twitch.tv/videos/123", "https://clips.twitch.tv/Test",
    "<iframe src='https://twitch.tv/test'></iframe>"]) assert.throws(() => parseStreamSource("twitch", source));
  for (const source of ["", "short", "a".repeat(12), "abcdefghij!", "https://youtube.com/@channel", "https://youtube.com/playlist?list=test",
    `https://youtube.com/watch?v=${youtube.id}&v=abcdefghijk`, "https://youtube.com/watch?v=bad", "https://twitch.tv/vanderfondi"]) {
    assert.throws(() => parseStreamSource("youtube", source));
  }
});

test("1–4 unique ordered options are accepted; zero, five, duplicates, and unsafe shapes fail", () => {
  for (let count = 1; count <= 4; count++) {
    const options = Array.from({ length: count }, (_, index) => ({ ...twitch, id: `test_${index}` }));
    assert.deepEqual(validateOptions(options), options);
  }
  for (const options of [[], Array(5).fill(twitch), [twitch, twitch], null, {}, [null], [{ ...twitch, id: "../bad" }],
    [{ ...youtube, id: "bad" }], [{ ...twitch, label: " " }], [{ ...twitch, label: " test " }],
    [{ ...twitch, label: "a".repeat(121) }], [{ ...twitch, html: "<iframe>" }]]) assert.throws(() => validateOptions(options));
});

test("slots last whole minutes from 5 minutes to 92 days within the supported range", () => {
  validateWindow(slot.starts_at, slot.ends_at);
  validateWindow(slot.starts_at, "2026-12-31T23:05:00.000Z");
  validateWindow(slot.starts_at, "2027-01-07T23:00:00.000Z");
  validateWindow(slot.starts_at, "2027-04-02T23:00:00.000Z"); // exactly 92 days
  for (const end of [slot.starts_at, "invalid", "2026-12-31T23:04:00.000Z", "2026-12-31T23:59:59.999Z",
    "2027-01-01T00:00:00.001Z", "2027-04-02T23:01:00.000Z", "2026-12-31T22:00:00.000Z"]) {
    assert.throws(() => validateWindow(slot.starts_at, end), end);
  }
  assert.equal(formatDuration(3_600_000), "1 h");
  assert.equal(formatDuration(45 * 60_000), "45 min");
  assert.equal(formatDuration(150 * 60_000), "2 h 30 min");
  assert.equal(formatDuration(76 * 3_600_000), "3 d 4 h");
  assert.throws(() => validateWindow("1999-01-01T00:00:00Z", "1999-01-01T01:00:00Z"));
});

test("active windows are start-inclusive, end-exclusive, and ignore drafts", () => {
  const start = Date.parse(slot.starts_at);
  assert.equal(activeSlot([slot], start - 1), undefined);
  assert.equal(activeSlot([slot], start), slot);
  assert.equal(activeSlot([slot], start + HOUR_MS - 1), slot);
  assert.equal(activeSlot([slot], start + HOUR_MS), undefined);
  assert.equal(activeSlot([{ ...slot, published: false }], start), undefined);
});

test("overlap rejects intersections and permits exactly adjacent slots", () => {
  const adjacent = { starts_at: slot.ends_at, ends_at: "2027-01-01T01:00:00.000Z" };
  assert.equal(overlaps(slot, adjacent), false);
  assert.equal(overlaps(adjacent, slot), false);
  assert.equal(overlaps(slot, slot), true);
  assert.equal(overlaps(slot, { starts_at: "2026-12-31T23:30:00Z", ends_at: "2027-01-01T00:30:00Z" }), true);
});

test("selection follows edits, removed options, ended slots, and slot transitions", () => {
  const selection = { slotId: slot.id, key: optionKey(youtube) };
  assert.equal(selectedOption(slot, null), twitch);
  assert.equal(selectedOption(slot, selection), youtube);
  assert.equal(selectedOption({ ...slot, options: [twitch] }, selection), twitch);
  assert.equal(selectedOption({ ...slot, options: [youtube, twitch] }, selection), youtube);
  assert.equal(selectedOption({ ...slot, id: "another-slot" }, selection), twitch);
  assert.equal(selectedOption(undefined, selection), undefined);
  const atEnd = activeSlot([slot], Date.parse(slot.ends_at));
  assert.equal(selectedOption(atEnd, selection), undefined);
});

test("constructed embeds disable autoplay and validate parent and IDs", () => {
  const embed = new URL(embedUrl(twitch, "watch.example.com"));
  assert.equal(embed.origin, "https://player.twitch.tv");
  assert.equal(embed.searchParams.get("parent"), "watch.example.com");
  assert.equal(embed.searchParams.get("autoplay"), "false");
  assert.equal(new URL(embedUrl(youtube, "localhost")).searchParams.get("autoplay"), "0");
  assert.equal(providerUrl(twitch), "https://www.twitch.tv/vanderfondi");
  for (const host of ["", "localhost:3000", "https://example.com", "evil&parent=other"]) assert.throws(() => embedUrl(twitch, host));
  assert.throws(() => embedUrl({ ...twitch, id: "bad&autoplay=true" }, "localhost"));
  assert.throws(() => providerUrl({ ...youtube, id: "../bad" }));
});

function loadedChoice(option: StreamOption): PlaybackState {
  return { selection: { slotId: slot.id, key: optionKey(option) }, loadedPlayer: `${slot.id}:${optionKey(option)}` };
}

test("room playback transition forgets removed B and cannot reconnect it when restored", () => {
  let state = loadedChoice(youtube);
  const iframeCounts: number[] = [];
  for (const current of [slot, { ...slot, options: [twitch] }, slot]) {
    state = reconcilePlayback(state, current, true);
    const option = selectedOption(current, state.selection);
    iframeCounts.push(Number(Boolean(option && state.loadedPlayer === `${current.id}:${optionKey(option)}`)));
  }
  assert.deepEqual(iframeCounts, [1, 0, 0]);
  assert.deepEqual(state, { selection: null, loadedPlayer: null });
  assert.equal(selectedOption(slot, state.selection), twitch);
  // Selecting B again is insufficient: only the explicit Load action restores consent.
  state = { selection: loadedChoice(youtube).selection, loadedPlayer: null };
  assert.equal(reconcilePlayback(state, slot, true).loadedPlayer, null);
  state = loadedChoice(youtube);
  assert.equal(reconcilePlayback(state, slot, true).loadedPlayer, state.loadedPlayer);
});

test("stale or ended room availability revokes consent permanently across recovery", () => {
  const endedSlot = activeSlot([slot], Date.parse(slot.ends_at));
  // ViewingRoom supplies undefined for a stale snapshot as well as an ended slot.
  for (const unavailable of [undefined, endedSlot]) {
    let state = reconcilePlayback(loadedChoice(youtube), slot, true);
    state = reconcilePlayback(state, unavailable, false);
    assert.deepEqual(state, { selection: null, loadedPlayer: null });
    state = reconcilePlayback(state, slot, true);
    assert.equal(state.loadedPlayer, null);
    assert.equal(state.selection, null);
  }
});

test("switching slots and returning cannot resurrect consent for the same provider ID", () => {
  let state = loadedChoice(youtube);
  const nextSlot = { ...slot, id: "22222222-2222-4222-8222-222222222222" };
  state = reconcilePlayback(state, nextSlot, true);
  assert.deepEqual(state, { selection: null, loadedPlayer: null });
  state = reconcilePlayback(state, slot, true);
  assert.equal(state.loadedPlayer, null);
});

test("continuous eligibility preserves a deliberate load across refresh, relabel, and reorder", () => {
  for (const chosen of [twitch, youtube]) {
    let state = loadedChoice(chosen);
    const original = state;
    for (const current of [slot, { ...slot, title: "Updated test title", options: [
      { ...youtube, label: "Updated test label" }, twitch,
    ] }, slot]) {
      state = reconcilePlayback(state, current, true);
      assert.equal(state, original);
      assert.equal(optionKey(selectedOption(current, state.selection)!), optionKey(chosen));
    }
  }
});

test("loss of embed eligibility clears load consent even if the option remains selected", () => {
  let state = loadedChoice(twitch);
  state = reconcilePlayback(state, slot, false);
  assert.equal(state.selection?.key, optionKey(twitch));
  assert.equal(state.loadedPlayer, null);
  state = reconcilePlayback(state, slot, true);
  assert.equal(state.loadedPlayer, null);
});

test("schedule decoder fails closed on malformed database or network data", () => {
  assert.deepEqual(decodeSlots([slot]), [slot]);
  for (const value of [null, {}, [null], [{ ...slot, id: "bad" }], [{ ...slot, published: "true" }],
    [{ ...slot, options: [] }], [{ ...slot, ends_at: slot.starts_at }]]) assert.throws(() => decodeSlots(value));
});

const channel: StreamOption = { provider: "youtube_channel", id: "UCabcdefghijklmnopqrstuv", label: "Test channel live" };

test("YouTube channel lives accept canonical channel URLs and IDs only", () => {
  for (const source of [channel.id, `https://www.youtube.com/channel/${channel.id}`, `https://youtube.com/channel/${channel.id}/live`,
    `https://m.youtube.com/channel/${channel.id}/streams/`, `https://www.youtube.com/embed/live_stream?channel=${channel.id}`]) {
    assert.equal(parseStreamSource("youtube_channel", source), channel.id);
  }
  for (const source of ["https://youtube.com/@channel", "UCshort", `uc${channel.id.slice(2)}`, `https://youtube.com/watch?v=${youtube.id}`,
    `https://youtube.com.evil.example/channel/${channel.id}`, `https://www.youtube.com/channel/${channel.id}/videos`,
    `https://www.youtube.com/embed/live_stream?channel=${channel.id}&channel=${channel.id}`]) {
    assert.throws(() => parseStreamSource("youtube_channel", source), source);
  }
  assert.throws(() => parseStreamSource("youtube", channel.id));
  assert.equal(providerUrl(channel), `https://www.youtube.com/channel/${channel.id}/live`);
  assert.equal(embedUrl(channel, "example.com"),
    `https://www.youtube.com/embed/live_stream?channel=${channel.id}&autoplay=0&playsinline=1`);
  assert.equal(providerName(channel.provider), "YouTube");
});

test("an optional IANA place survives validation; malformed or unknown places fail", () => {
  const placed = { ...channel, zone: "Australia/Sydney" };
  assert.deepEqual(validateOptions([placed, twitch]), [placed, twitch]);
  assert.equal("zone" in validateOptions([twitch])[0], false);
  for (const zone of ["", "UTC", "../etc/passwd", "Australia/Sydney/Extra/Deep", "A".repeat(65), 7, null]) {
    assert.throws(() => validateOptions([{ ...twitch, zone }]), String(zone));
  }
  assert.equal(parseZone("  "), undefined);
  assert.equal(parseZone(" America/Santiago "), "America/Santiago");
  assert.throws(() => parseZone("Mars/Olympus_Mons"));
});

test("deep links only select well-formed slot and stream pairs", () => {
  assert.deepEqual(parseSelection(slot.id, optionKey(channel)), { slotId: slot.id, key: optionKey(channel) });
  for (const [slotId, key] of [[slot.id, "twitch:"], [slot.id, ":vanderfondi"], [slot.id, "twitter:vanderfondi"],
    [slot.id, "youtube:short"], ["not-a-uuid", optionKey(twitch)], [[slot.id], optionKey(twitch)], [slot.id, undefined]]) {
    assert.equal(parseSelection(slotId, key), null, String(key));
  }
});

import { URL_CASES } from "./url-cases";
import { capLiveKeys, isUrlProvider, normalizeStreamUrl, streamHost, validProviderId } from "../../lib/streams/domain";


test("stream URLs: HTTPS, public host, matching extension, no credentials, separators or fragments", () => {
  for (const [provider, id, ok] of URL_CASES) {
    assert.equal(validProviderId(provider, id), ok, `${provider} ${id}`);
  }
  assert.equal(normalizeStreamUrl("link", `https://example.com/${"a".repeat(400)}`), null);
  assert.equal(normalizeStreamUrl("link", "https://cdn.example.com:22/x"), null, "privileged ports are refused");
  assert.equal(normalizeStreamUrl("link", "https://cdn.example.com:8443/x"), "https://cdn.example.com:8443/x");
});

// The application reads these (and saves them in the canonical form below), but the SQL check wants the
// canonical form and refuses the spelling as typed: that is how the database stays stricter than the app.
const READ_BUT_NOT_CANONICAL: [provider: "hls" | "dash" | "link", id: string, canonical: string][] = [
  ["hls", "https://CDN.example.com/a.m3u8", "https://cdn.example.com/a.m3u8"],
  ["link", "https://www.example.com", "https://www.example.com/"],
  ["link", "https://www.example.com?x=1", "https://www.example.com/?x=1"],
  ["link", "https://www.example.com/a/../b", "https://www.example.com/b"],
  ["link", "https://www.example.com/a/%2e%2e/b", "https://www.example.com/b"],
  ["link", "https://www.example.com:08443/b", "https://www.example.com:8443/b"],
];

test("spellings the parser rewrites are accepted when read, and stored in their canonical form", () => {
  for (const [provider, id, canonical] of READ_BUT_NOT_CANONICAL) {
    assert.equal(validProviderId(provider, id), true, id);
    assert.equal(parseStreamSource(provider, id), canonical, id);
    assert.equal(validProviderId(provider, canonical), true, canonical);
  }
});

test("validity does not depend on how this engine serializes a URL (it differs: Node 22 keeps ^ in a path, Node 24 writes %5E)", () => {
  for (const id of ["https://www.example.com/a^b", "https://www.example.com/a%5Eb", "https://www.example.com/a{b}", "https://www.example.com/a%7Bb%7D"]) {
    assert.equal(validProviderId("link", id), true, id);
  }
});

test("stream URLs are stored in the parser's canonical form", () => {
  assert.equal(parseStreamSource("hls", "  https://CDN.Example.com/Live/Index.M3U8?x=1  "), "https://cdn.example.com/Live/Index.M3U8?x=1");
  assert.equal(parseStreamSource("link", "https://www.example.com"), "https://www.example.com/");
  assert.throws(() => parseStreamSource("hls", "https://cdn.example.com/index.mpd"), /\.m3u8/);
  assert.throws(() => parseStreamSource("dash", "https://cdn.example.com/index.m3u8"), /\.mpd/);
  assert.throws(() => parseStreamSource("link", "http://www.example.com/"), /HTTPS/);
});

test("URL options validate, deduplicate, resolve addresses and survive deep links", () => {
  const hls: StreamOption = { provider: "hls", id: "https://cdn.example.com/live/index.m3u8?t=1", label: "Sydney feed", zone: "Australia/Sydney" };
  const link: StreamOption = { provider: "link", id: "https://tv.example.com/live", label: "TV page" };
  assert.deepEqual(validateOptions([hls, link, twitch]), [hls, link, twitch]);
  assert.throws(() => validateOptions([hls, { ...hls, label: "Same address" }]));
  assert.equal(providerUrl(hls), hls.id);
  assert.equal(providerName("hls"), "HLS");
  assert.equal(providerName("dash"), "DASH");
  assert.equal(providerName("link"), "Web");
  assert.equal(streamHost(hls), "cdn.example.com");
  assert.equal(streamHost(twitch), null);
  assert.throws(() => embedUrl(hls, "example.com"), /video player/);
  assert.equal(isUrlProvider("hls") && isUrlProvider("link") && !isUrlProvider("twitch"), true);
  const key = optionKey(hls);
  assert.deepEqual(parseSelection(slot.id, key), { slotId: slot.id, key });
  const roundTrip = new URLSearchParams(new URLSearchParams({ slot: slot.id, stream: key }).toString()).get("stream");
  assert.equal(roundTrip, key);
  assert.equal(parseSelection(slot.id, "hls:https://127.0.0.1/a.m3u8"), null);
  assert.equal(key.includes(","), false, "keys stay safe in comma-separated status requests");
});

test("status keys are capped by count and by their percent-encoded length", () => {
  assert.deepEqual(capLiveKeys(["twitch:a", "twitch:b"]), ["twitch:a", "twitch:b"]);
  assert.equal(capLiveKeys(Array.from({ length: 40 }, (_, index) => `twitch:c${index}`)).length, 24);
  // Signed URLs expand a lot when encoded: ':' '/' '?' '=' '&' each become three characters.
  const signed = (index: number) => `hls:https://cdn.example.com/live/${index}/index.m3u8?token=${"a=b&".repeat(60)}`;
  const kept = capLiveKeys(Array.from({ length: 24 }, (_, index) => signed(index)));
  const wire = new URLSearchParams({ keys: kept.join(",") }).toString();
  assert.ok(wire.length <= 6_005, `encoded query is ${wire.length} characters`);
  assert.ok(kept.length < 24, "the encoded length, not the raw one, limits the list");
  // The raw characters alone would have fit the old 6,000-character cap for 20 of these keys.
  assert.ok(Array.from({ length: 20 }, (_, index) => signed(index)).join(",").length <= 6_000);
  // An oversized key is skipped, not allowed to block the smaller ones after it.
  assert.deepEqual(capLiveKeys(["twitch:a", `hls:https://cdn.example.com/${"/".repeat(2_500)}`, "twitch:b"]), ["twitch:a", "twitch:b"]);
});

import { ageSeconds } from "../../lib/streams/domain";

test("a shared answer's age comes from the Age header, whole seconds only, and is bounded", () => {
  assert.equal(ageSeconds(null), 0);
  assert.equal(ageSeconds("7"), 7);
  assert.equal(ageSeconds(" 12 "), 12);
  assert.equal(ageSeconds("-3"), 0);
  assert.equal(ageSeconds("1.5"), 0);
  assert.equal(ageSeconds("abc"), 0);
  assert.equal(ageSeconds("99999"), 300);
});

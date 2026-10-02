import assert from "node:assert/strict";
import test from "node:test";
import { parseChannelFeed, parseTwitchStreams, parseTwitchUsers, parseYouTubeVideos } from "../../lib/streams/live-parse";
import { MAIN_CHANNEL, twitchChatUrl, youtubeChatUrl } from "../../lib/streams/domain";

test("Twitch streams: live entries keyed by login, sized thumbnails, unsafe fields dropped", () => {
  const parsed = parseTwitchStreams({ data: [
    { user_login: "VanderFondi", type: "live", title: " New Year ", viewer_count: 1234, started_at: "2026-12-31T22:00:00Z",
      thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_vanderfondi-{width}x{height}.jpg" },
    { user_login: "other", type: "live", viewer_count: -5, thumbnail_url: "https://evil.example/x.jpg", started_at: "nope" },
    { user_login: "rerun", type: "" },
    null, "junk",
  ] });
  assert.deepEqual(parsed.get("vanderfondi"), { live: true, title: "New Year", viewers: 1234,
    startedAt: "2026-12-31T22:00:00.000Z", thumbnail: "https://static-cdn.jtvnw.net/previews-ttv/live_user_vanderfondi-640x360.jpg" });
  assert.deepEqual(parsed.get("other"), { live: true, title: undefined, viewers: undefined, startedAt: undefined, thumbnail: undefined });
  assert.equal(parsed.has("rerun"), false);
  assert.equal(parseTwitchStreams({}).size, 0);
  assert.equal(parseTwitchStreams(null).size, 0);
});

test("Twitch users: only provider-hosted avatars", () => {
  const avatars = parseTwitchUsers({ data: [
    { login: "a", profile_image_url: "https://static-cdn.jtvnw.net/jtv_user_pictures/a.png" },
    { login: "b", profile_image_url: "http://static-cdn.jtvnw.net/b.png" },
  ] });
  assert.equal(avatars.get("a"), "https://static-cdn.jtvnw.net/jtv_user_pictures/a.png");
  assert.equal(avatars.has("b"), false);
});

test("YouTube videos: live only when YouTube says so, viewers only while live", () => {
  const videos = parseYouTubeVideos({ items: [
    { id: "M7lc1UVf-VE", snippet: { title: "Fireworks", liveBroadcastContent: "live" },
      liveStreamingDetails: { concurrentViewers: "5000", actualStartTime: "2026-12-31T12:30:00Z" } },
    { id: "aaaaaaaaaaa", snippet: { title: "Replay", liveBroadcastContent: "none" }, liveStreamingDetails: { concurrentViewers: "9" } },
    { id: "bad id" },
  ] });
  assert.deepEqual(videos.get("M7lc1UVf-VE"), { live: true, title: "Fireworks", viewers: 5000,
    startedAt: "2026-12-31T12:30:00.000Z", thumbnail: "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault_live.jpg", videoId: "M7lc1UVf-VE" });
  assert.equal(videos.get("aaaaaaaaaaa")?.live, false);
  assert.equal(videos.get("aaaaaaaaaaa")?.viewers, undefined);
  assert.equal(videos.size, 2);
});

test("channel feeds yield unique recent video IDs only", () => {
  const xml = "<feed><entry><yt:videoId>M7lc1UVf-VE</yt:videoId></entry><entry><yt:videoId>M7lc1UVf-VE</yt:videoId></entry>"
    + "<entry><yt:videoId>bad</yt:videoId></entry><entry><yt:videoId>aaaaaaaaaaa</yt:videoId></entry></feed>";
  assert.deepEqual(parseChannelFeed(xml), ["M7lc1UVf-VE", "aaaaaaaaaaa"]);
});

test("chat embeds are built from validated IDs and hostnames only", () => {
  assert.equal(twitchChatUrl(MAIN_CHANNEL, "example.com", false), "https://www.twitch.tv/embed/vanderfondi/chat?parent=example.com");
  assert.equal(twitchChatUrl(MAIN_CHANNEL, "example.com", true), "https://www.twitch.tv/embed/vanderfondi/chat?parent=example.com&darkpopout=");
  assert.equal(youtubeChatUrl("M7lc1UVf-VE", "example.com"), "https://www.youtube.com/live_chat?v=M7lc1UVf-VE&embed_domain=example.com");
  assert.throws(() => twitchChatUrl("../x", "example.com", false));
  assert.throws(() => twitchChatUrl(MAIN_CHANNEL, "evil.com/x", false));
  assert.throws(() => youtubeChatUrl("short", "example.com"));
});

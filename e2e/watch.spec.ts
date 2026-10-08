import { resolveRolloverArrival } from "../data/relay";
import { crossingYear, IDS, STREAMS } from "./fixtures";

const PLAYLIST = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6.0,\nseg0.ts\n";
const CORS = { "access-control-allow-origin": "*" };
const channel = (page: import("@playwright/test").Page, label: string) =>
  page.getByRole("complementary", { name: "On now" }).getByRole("button", { name: new RegExp(label.replace(/[()]/g, "\\$&")) });
import { expect, test } from "./test";

const rail = (page: import("@playwright/test").Page) => page.getByRole("complementary", { name: "On now" });

test("shows the slot on now, without loading any player or chat", async ({ page }) => {
  await page.goto("/watch");
  await expect(rail(page)).toContainText("Rehearsal on now (test)");
  const channels = rail(page).getByRole("button");
  await expect(channels).toHaveCount(4);
  // No provider credentials in tests: nothing is confirmed, so nothing reads live.
  await expect(channels.first()).toContainText("Scheduled");
  await expect(rail(page).getByText("Live", { exact: true })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Coming up", exact: true })).toBeVisible();
  await expect(page.getByText("Coming up next (test)").first()).toBeVisible();
  await expect(page.getByText("Draft (test)")).toHaveCount(0);
});

test("loads a YouTube player and chat only on click", async ({ page }) => {
  await page.goto("/watch");
  await rail(page).getByRole("button", { name: new RegExp(STREAMS.harbour.label.replace(/[()]/g, "\\$&")) }).click();
  await expect(page.getByRole("heading", { level: 2, name: STREAMS.harbour.label })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Load YouTube player" }).click();
  await expect(page.locator("iframe").first()).toHaveAttribute("src", new RegExp(`youtube.*${STREAMS.harbour.id}`));
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("over plain HTTP, Twitch chat is offered as a pop-out", async ({ page }) => {
  await page.goto("/watch");
  const chat = page.getByRole("complementary", { name: "Chat" });
  await expect(chat).toContainText("Open it in a new window instead.");
  await expect(chat.getByRole("link", { name: "Pop out" })).toHaveAttribute("href", "https://www.twitch.tv/popout/vanderfondi/chat");
});

test("a deep link selects its stream while that slot is on", async ({ page }) => {
  await page.goto(`/watch?slot=${IDS.now}&stream=youtube_channel%3A${STREAMS.harbour.id}`);
  await expect(rail(page).getByRole("button", { pressed: true })).toContainText(STREAMS.harbour.label);
});

test("shows provider-confirmed live status, and drops it when status fails", async ({ page, consoleErrors }) => {
  let fail = false;
  await page.clock.install();
  await page.route("**/watch/live?**", (route) => fail
    ? route.fulfill({ status: 500, body: "unavailable" })
    : route.fulfill({ json: {
      live: { "twitch:studio_cam": { live: true, viewers: 1834, title: "Countdown rehearsal (test)", startedAt: new Date(Date.now() - 90 * 60_000).toISOString() } },
      providers: { twitch: true, youtube: true },
    } }));
  await page.goto("/watch");
  const studio = rail(page).getByRole("button", { name: new RegExp(STREAMS.studio.label.replace(/[()]/g, "\\$&")) });
  await expect(studio).toContainText("Live");
  await expect(studio).toContainText("1.8K watching");
  await expect(page.getByText("Countdown rehearsal (test)")).toBeVisible();

  fail = true;
  await page.clock.runFor(61_000);
  await expect(studio).toContainText("Scheduled");
  // The browser logs the failed poll this test asked for; nothing else may fail.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((text) => !text.includes("status of 500")));
});

test("without provider credentials, the live status route confirms nothing", async ({ request }) => {
  const response = await request.get(`/watch/live?keys=twitch:studio_cam,twitch:someone_else`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("s-maxage=30");
  expect(await response.json()).toEqual({ live: {}, providers: { twitch: false, youtube: false } });
});

// Recent Chrome reports native HLS support; the room must still use hls.js, whose requests the suite can see.
const claimNativeHls = (page: import("@playwright/test").Page) => page.addInitScript(() => {
  const original = HTMLMediaElement.prototype.canPlayType;
  HTMLMediaElement.prototype.canPlayType = function (type: string) {
    return /mpegurl/i.test(type) ? "maybe" : original.call(this, type);
  };
});

test("a direct HLS stream shows its host, contacts nothing until loaded, then plays in the room", async ({ page }) => {
  await claimNativeHls(page);
  const requests: string[] = [];
  await page.route("https://streams.example.test/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/vnd.apple.mpegurl", headers: CORS, body: PLAYLIST });
  });
  await page.goto("/watch");
  await expect(channel(page, STREAMS.direct.label)).toContainText("HLS · streams.example.test");
  await channel(page, STREAMS.direct.label).click();
  await expect(page.getByText("Loading connects your browser to streams.example.test, which this site does not run.")).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Load HLS player" }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect.poll(() => requests[0]).toBe(STREAMS.direct.id);
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(page.locator("video")).toHaveCount(0);
});

test("when a direct stream cannot play, the room says so and offers its address", async ({ page, consoleErrors }) => {
  await claimNativeHls(page);
  await page.route("https://streams.example.test/**", (route) => route.fulfill({ status: 404, headers: CORS, body: "gone" }));
  await page.goto("/watch");
  await channel(page, STREAMS.direct.label).click();
  await page.getByRole("button", { name: "Load HLS player" }).click();
  await expect(page.getByRole("region", { name: "Player" }).getByRole("alert")).toContainText("could not be played here");
  await expect(page.getByRole("button", { name: "Copy stream address" })).toBeVisible();
  // The browser logs the 404 this test provoked; nothing else may fail.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((text) => !text.includes("status of 404")));
});

test("a direct stream's address can be copied", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions are granted for Chromium only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/watch");
  await channel(page, STREAMS.direct.label).click();
  await page.getByRole("button", { name: "Copy stream address" }).click();
  await expect(page.getByRole("button", { name: "Address copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(STREAMS.direct.id);
});

for (const [label, install] of [
  ["writeText is rejected", () => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("blocked")) } })],
  ["there is no Clipboard API", () => Object.defineProperty(navigator, "clipboard", { value: undefined })],
] as const) {
  test(`when ${label}, the address is shown to select and copy by hand`, async ({ page }) => {
    await page.addInitScript(install);
    await page.goto("/watch");
    await channel(page, STREAMS.direct.label).click();
    await page.getByRole("button", { name: "Copy stream address" }).click();
    const field = page.getByLabel("Copying was blocked. Select and copy the address:");
    await expect(field).toHaveValue(STREAMS.direct.id);
    await expect(field).toBeFocused();
    await expect(page.getByRole("button", { name: "Address copied" })).toHaveCount(0);
  });
}

test("with the browser's own HLS player (no hls.js), closing the player pauses and unloads the video", async ({ page, consoleErrors }) => {
  await page.addInitScript(() => {
    // No Media Source Extensions: hls.js is unsupported, so the room falls back to the native player.
    for (const name of ["MediaSource", "ManagedMediaSource", "WebKitMediaSource"]) Object.defineProperty(window, name, { value: undefined, configurable: true });
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type: string) { return /mpegurl/i.test(type) ? "maybe" : original.call(this, type); };
    const w = window as unknown as { __paused: boolean; __unloaded: boolean };
    w.__paused = false; w.__unloaded = false;
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () { w.__paused = true; return pause.call(this); };
    // The app never calls load() itself except to unload; record that it did so with no source left.
    const load = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function () { if (!this.getAttribute("src")) w.__unloaded = true; return load.call(this); };
  });
  await page.goto("/watch");
  await channel(page, STREAMS.direct.label).click();
  await page.getByRole("button", { name: "Load HLS player" }).click();
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(page.locator("video")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __paused: boolean }).__paused)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __unloaded: boolean }).__unloaded)).toBe(true);
  // The unsupported native source may log a load error of its own; nothing else may fail.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((text) => !/Failed to load resource|ERR_/.test(text)));
});

test("a web link source is never embedded: it opens its own page", async ({ page }) => {
  await page.goto("/watch");
  await channel(page, STREAMS.page.label).click();
  await expect(page.getByText("This source cannot be shown inside the room. Open tv.example.test in a new tab.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Load / })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open tv.example.test" })).toHaveAttribute("href", STREAMS.page.id);
  await expect(page.locator("iframe, video")).toHaveCount(0);
});

test("a direct stream confirmed live by its playlist shows Live, with no viewer count", async ({ page }) => {
  await page.route("**/watch/live?**", (route) => route.fulfill({ json: {
    live: { [`hls:${STREAMS.direct.id}`]: { live: true } }, providers: { twitch: false, youtube: false } } }));
  await page.goto("/watch");
  await expect(channel(page, STREAMS.direct.label)).toContainText("Live");
  await expect(channel(page, STREAMS.direct.label)).not.toContainText("watching");
});

test("when the video element itself errors, the player is released and stops polling the stream", async ({ page }) => {
  await claimNativeHls(page);
  let playlistRequests = 0;
  await page.route("https://streams.example.test/**", (route) => {
    if (route.request().url().endsWith(".m3u8")) {
      playlistRequests++;
      // A live playlist with a 1 s target duration: hls.js asks for it again about every second.
      return route.fulfill({ status: 200, contentType: "application/vnd.apple.mpegurl", headers: CORS,
        body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1.0,\nseg0.ts\n" });
    }
    return new Promise<void>(() => { /* segments never arrive */ });
  });
  await page.goto("/watch");
  await channel(page, STREAMS.direct.label).click();
  await page.getByRole("button", { name: "Load HLS player" }).click();
  await expect.poll(() => playlistRequests, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);

  await page.locator("video").evaluate((video) => video.dispatchEvent(new Event("error")));
  await expect(page.getByRole("region", { name: "Player" }).getByRole("alert")).toContainText("could not be played here");
  const settled = playlistRequests;
  await page.waitForTimeout(3_500);
  expect(playlistRequests, "no more playlist requests after the failure view").toBeLessThanOrEqual(settled + 1);
});

test("a preview reads the schedule as of the simulated instant and shows no provider status", async ({ page }) => {
  const sydney = resolveRolloverArrival("Australia/Sydney", crossingYear(Date.now())).arrivalUtcMs;
  let asked = 0;
  await page.route("**/watch/live?**", (route) => { asked++; return route.fulfill({ json: { live: {}, providers: {} } }); });
  // Five minutes before Sydney's midnight, a slot that is hours or months away in real time.
  await page.goto(`/watch?at=${new Date(sydney - 5 * 60_000).toISOString()}&speed=1`);
  await expect(page.getByRole("status").filter({ hasText: "Preview" })).toContainText("Nothing here is live.");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page).toHaveTitle(/^Viewing room \(preview\) \| #\d{4}Live$/);
  await expect(page.getByRole("link", { name: "Back to the relay" })).toHaveAttribute("href", /^\/road-to\?at=.*&speed=1$/);
  await expect(rail(page)).toContainText(STREAMS.sydney.label);
  await expect(rail(page).getByText("Live", { exact: true })).toHaveCount(0);
  expect(asked).toBe(0);
  await page.getByRole("link", { name: "Back to real time" }).click();
  await expect(page).toHaveURL(/\/watch$/);
  await expect(rail(page)).toContainText("Rehearsal on now (test)");
});

test("a preview's clock keeps advancing through a slow schedule response", async ({ page }) => {
  const at = Date.UTC(2026, 11, 31, 10);
  // Answer after 1.5 s: at 3600x that is 1.5 simulated hours the clock must not lose.
  await page.route("**/watch/schedule**", async (route) => { await new Promise((resolve) => setTimeout(resolve, 1_500)); await route.continue(); });
  await page.goto(`/watch?at=${new Date(at).toISOString()}&speed=3600`);
  const clock = page.getByRole("status").filter({ hasText: "Preview" }).locator("xpath=following-sibling::p").locator("time");
  await expect(clock).toBeVisible();
  const shown = Date.parse((await clock.getAttribute("datetime")) ?? "");
  expect(shown - at).toBeGreaterThanOrEqual(3_600_000);
});

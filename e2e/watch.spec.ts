import { IDS, STREAMS } from "./fixtures";
import { expect, test } from "./test";

const rail = (page: import("@playwright/test").Page) => page.getByRole("complementary", { name: "On now" });

test("shows the slot on now, without loading any player or chat", async ({ page }) => {
  await page.goto("/watch");
  await expect(rail(page)).toContainText("Rehearsal on now (test)");
  const channels = rail(page).getByRole("button");
  await expect(channels).toHaveCount(2);
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

import { adminSessionCookie, IDS } from "./fixtures";
import { expect, test } from "./test";

test("without a session, /admin sends you to sign in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test.describe("signed in as an administrator", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([adminSessionCookie()]);
  });

  test("lists the saved slots, including private drafts", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Schedule manager." })).toBeVisible();
    const saved = page.getByRole("region", { name: "Saved slots" });
    await expect(saved.getByRole("heading", { name: "Rehearsal on now (test)" })).toBeVisible();
    await expect(saved.getByRole("heading", { name: "Draft (test)" })).toBeVisible();
    await expect(saved).toContainText("Private draft");
  });

  test("shows who changed the schedule, from the database's own log", async ({ page }) => {
    await page.goto("/admin");
    const log = page.getByRole("region", { name: "Recent changes" });
    const entries = log.getByRole("listitem");
    await expect(entries).toHaveCount(3);
    // Newest first: your own publish, someone else's creation, then a deletion made outside the app.
    await expect(entries.nth(0)).toContainText("Rehearsal on now (test)");
    await expect(entries.nth(0)).toContainText("Published");
    await expect(entries.nth(0)).toContainText("You");
    await expect(entries.nth(1)).toContainText("Created as a draft");
    await expect(entries.nth(1)).toContainText("Admin 33333333");
    await expect(entries.nth(2)).toContainText("Removed rehearsal (test)");
    await expect(entries.nth(2)).toContainText("Deleted");
    await expect(entries.nth(2)).toContainText("Database or service");
    await expect(entries.nth(2).getByRole("link")).toHaveCount(0);
    await expect(entries.nth(0).getByRole("link", { name: /Open/ })).toHaveAttribute("href", `/admin?edit=${IDS.now}`);
  });

  test("saves a draft with a direct stream", async ({ page }) => {
    await page.goto("/admin");
    const editor = page.getByRole("region", { name: "Create a slot" });
    await editor.getByLabel("Slot title").fill("Admin draft (test)");
    await editor.getByLabel(/^Start time/).fill("2031-01-01T10:00");
    await editor.getByLabel("Provider").selectOption("hls");
    await editor.getByLabel("HLS playlist address (.m3u8)").fill("https://cdn.example.test/live/index.m3u8");
    await editor.getByLabel("Display label").fill("Admin feed (test)");
    await editor.getByRole("button", { name: "Save draft" }).click();
    await expect(editor.getByRole("status")).toContainText("Draft saved");
    await page.reload();
    await expect(page.getByRole("region", { name: "Saved slots" }).getByRole("heading", { name: "Admin draft (test)" })).toBeVisible();
  });

  test("reads an .m3u list and fills the option from a chosen channel", async ({ page }) => {
    await page.goto("/admin");
    const editor = page.getByRole("region", { name: "Create a slot" });
    await editor.getByText("Pick channels from a list (.m3u)").click();
    await editor.getByRole("textbox", { name: /list/i }).fill("#EXTM3U\n#EXTINF:-1 group-title=\"News\",Evening news (test)\nhttps://cdn.example.test/news/index.m3u8\n#EXTINF:-1,Plain HTTP (test)\nhttp://cdn.example.test/old.m3u8\n");
    await editor.getByRole("button", { name: /Read list/i }).click();
    await expect(editor.getByText("1 usable channels read")).toBeVisible();
    await editor.getByRole("button", { name: /Evening news \(test\)/ }).first().click();
    await expect(editor.getByLabel("HLS playlist address (.m3u8)")).toHaveValue("https://cdn.example.test/news/index.m3u8");
    await expect(editor.getByLabel("Display label")).toHaveValue("Evening news (test)");
  });
});

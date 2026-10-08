import { editionTag, editionYear } from "../lib/edition";
import { expect, test } from "./test";

test("counts down to the current edition", async ({ page }) => {
  const year = editionYear(Date.now());
  await page.goto("/");
  await expect(page).toHaveTitle(editionTag(year));
  await expect(page.getByRole("timer", { name: `Remaining time until January 1, ${year}` })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: `Progress of the year ${year - 1}` })).toBeVisible();
  await page.getByRole("link", { name: "See the relay" }).click();
  await expect(page).toHaveURL(/\/road-to$/);
});

test("after the viewer's own midnight, says the new year is here until the wave ends", async ({ page }) => {
  const year = editionYear(Date.now());
  // 05:00 UTC on January 1: past midnight in Santiago (UTC−3), before the wave ends at 12:00 UTC.
  await page.clock.install({ time: new Date(Date.UTC(year, 0, 1, 5)) });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText(`It’s ${year} here. Midnight is still crossing the planet.`);
});

test("a preview counts down from the simulated instant, keeps it out of search and carries it on", async ({ page }) => {
  const year = editionYear(Date.now());
  // Two days before the edition's January 1, viewer-local.
  const at = new Date(year, 0, 1, 0, 0, 0).getTime() - 2 * 86_400_000;
  await page.goto(`/?at=${new Date(at).toISOString()}&speed=1`);
  await expect(page.getByRole("status").filter({ hasText: "Preview" })).toContainText("Nothing here is live.");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page).toHaveTitle(`${editionTag(year)} (preview)`);
  await expect(page.getByRole("timer")).toContainText("01");
  await expect(page.getByRole("link", { name: "Enter the viewing room" })).toHaveAttribute("href", /^\/watch\?at=.*&speed=1$/);
  await page.getByRole("link", { name: "Back to real time" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Nothing here is live.")).toHaveCount(0);
});

test("a preview past midnight says the new year is here, then moves on to the next edition", async ({ page }) => {
  const year = editionYear(Date.now());
  await page.goto(`/?at=${new Date(Date.UTC(year, 0, 1, 5)).toISOString()}&speed=1`);
  await expect(page.getByRole("status").filter({ hasText: "It’s" })).toHaveText(`It’s ${year} here. Midnight is still crossing the planet.`);
  await page.goto(`/?at=${new Date(Date.UTC(year, 0, 1, 13)).toISOString()}&speed=1`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`#${year + 1}`);
  // The tab names the simulated edition too, not the real one.
  await expect(page).toHaveTitle(`${editionTag(year + 1)} (preview)`);
});

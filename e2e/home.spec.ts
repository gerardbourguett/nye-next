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

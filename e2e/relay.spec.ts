import { editionYear } from "../lib/edition";
import { crossingYear, IDS, STREAMS } from "./fixtures";
import { expect, test } from "./test";

const year = editionYear(Date.now());
const crossings = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Places on Earth, in the order midnight reaches them" }).locator(":scope > li");

test("lists every crossing into the edition and draws the map", async ({ page }) => {
  await page.goto("/road-to");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Relay.");
  const count = await crossings(page).count();
  expect(count).toBeGreaterThan(30); // half- and quarter-hour offsets included
  await expect(page.getByText(`/ ${count} crossings`)).toBeVisible();
  await expect(page.getByRole("group", { name: new RegExp(`already in ${year}`) })).toBeVisible();
  await expect(crossings(page).first()).toContainText("+14:00");
  // The last inhabited midnight; UTC−12 has no listed place.
  await expect(crossings(page).last()).toContainText("Pago Pago");
});

test("finds a place and marks it in the crossing order", async ({ page }) => {
  await page.goto("/road-to");
  await page.getByLabel("Find a place").fill("sydney");
  await page.getByRole("button", { name: "Show crossing" }).click();
  await expect(page.locator("#crossing-660 strong", { hasText: "Sydney" })).toBeVisible();
  await expect(page.locator("#crossing-660")).toBeFocused();

  await page.getByLabel("Find a place").fill("Nowhere");
  await page.getByRole("button", { name: "Show crossing" }).click();
  await expect(page.getByText("No listed place matches.")).toHaveText("No listed place matches. Pick one from the list.");
});

test("remembers the viewer's chosen place across visits", async ({ page }) => {
  await page.goto("/road-to");
  // Santiago observes UTC−3 at New Year, from the device's timezone.
  await expect(page.locator("#crossing--180")).toContainText("You are here");
  await page.getByLabel("Celebrating somewhere else?").fill("Auckland");
  await page.getByRole("button", { name: "Set my place" }).click();
  await expect(page.locator("#crossing-780")).toContainText("You are here · Auckland");
  await page.reload();
  await expect(page.locator("#crossing-780")).toContainText("You are here · Auckland");
  await page.getByRole("button", { name: "Use my device’s timezone" }).click();
  await expect(page.locator("#crossing-780")).not.toContainText("You are here");
});

test("previews the night and links a crossing's stream to the viewing room", async ({ page }) => {
  // A month before the wave whose Sydney slot is still ahead.
  await page.goto(`/road-to?at=${new Date(Date.UTC(crossingYear(Date.now()) - 1, 11, 1)).toISOString()}&speed=1`);
  await expect(page.getByRole("status").filter({ hasText: "Preview" })).toContainText("Nothing here is live.");
  const link = page.locator("#crossing-660").getByRole("link", { name: STREAMS.sydney.label });
  await expect(link).toHaveAttribute("href", `/watch?slot=${IDS.crossing}&stream=youtube%3A${STREAMS.sydney.id}`);
  await link.click();
  await expect(page).toHaveURL(/\/watch\?slot=/);
  await expect(page.getByRole("status").filter({ hasText: STREAMS.sydney.label }))
    .toContainText("It will be selected here when that slot begins.");
});

test("a preview at the end of the wave shows every crossing done", async ({ page }) => {
  await page.goto(`/road-to?at=${new Date(Date.UTC(year, 0, 1, 11, 59)).toISOString()}&speed=1`);
  await expect(page.getByRole("heading", { name: "The relay is complete" })).toBeVisible();
  const count = await crossings(page).count();
  await expect(page.getByText(`${count} / ${count} crossings`)).toBeVisible();
  await expect(crossings(page).last()).toContainText("Crossed");
});

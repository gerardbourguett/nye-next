import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { adminSessionCookie } from "./fixtures";
import { expect, test } from "./test";

// WCAG 2.0/2.1 A and AA, plus axe's best practices, on every page in both colour schemes.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    // What axe measured (for contrast: the colours and the ratio), so a failure says what to change.
    targets: violation.nodes.slice(0, 4).map((node) => `${node.target.join(" ")} — ${node.any[0]?.message ?? node.failureSummary ?? ""}`),
  }));
}

const PAGES: [name: string, path: string][] = [
  ["home", "/"],
  ["relay", "/road-to"],
  ["viewing room", "/watch"],
  ["home preview", `/?at=${new Date(Date.UTC(2026, 11, 31, 22)).toISOString()}&speed=1`],
  ["admin sign-in", "/admin/login"],
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    for (const [name, path] of PAGES) {
      test(`${name} has no accessibility violations`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(await violations(page)).toEqual([]);
      });
    }

    test("the viewing room with a stream selected has no accessibility violations", async ({ page }) => {
      await page.goto("/watch");
      await page.getByRole("complementary", { name: "On now" }).getByRole("button").nth(1).click();
      await page.waitForLoadState("networkidle");
      expect(await violations(page)).toEqual([]);
    });

    test("the relay with a place found has no accessibility violations", async ({ page }) => {
      await page.goto("/road-to");
      await page.getByLabel(/find a place/i).fill("Sydney");
      await page.keyboard.press("Enter");
      await page.waitForLoadState("networkidle");
      expect(await violations(page)).toEqual([]);
    });

    test.describe("the schedule manager", () => {
      test.beforeEach(async ({ context }) => { await context.addCookies([adminSessionCookie()]); });

      test("has no accessibility violations", async ({ page }) => {
        await page.goto("/admin");
        await page.waitForLoadState("networkidle");
        expect(await violations(page)).toEqual([]);
      });
    });
  });
}

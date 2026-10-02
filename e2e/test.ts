import { expect, test as base } from "@playwright/test";

/**
 * Every page must render without console errors (hydration mismatches
 * included), and no test may reach a real provider: Twitch and YouTube
 * requests are answered locally.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(/^https:\/\/([a-z0-9-]+\.)*(twitch\.tv|youtube\.com|youtube-nocookie\.com|ytimg\.com|jtvnw\.net)\//,
      (route) => route.fulfill({ status: 204, body: "" }));
    await use(errors);
    expect(errors, "console errors").toEqual([]);
  }, { auto: true }],
});

export { expect };

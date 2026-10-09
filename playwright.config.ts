import { defineConfig, devices } from "@playwright/test";

import { APP_PORT, MOCK_PORT } from "./e2e/fixtures";

// The app is built against a stand-in Supabase (e2e/supabase-mock.ts):
// NEXT_PUBLIC_* values are inlined at build time, so the suite builds its own.
const env = {
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
  // Canonical links, the sitemap and share images are absolute: point them at the app under test.
  SITE_URL: `http://127.0.0.1:${APP_PORT}`,
  // Never reach Twitch or YouTube from tests, even with a developer's .env.local.
  TWITCH_CLIENT_ID: "",
  TWITCH_CLIENT_SECRET: "",
  YOUTUBE_API_KEY: "",
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    timezoneId: "America/Santiago",
    locale: "en-US",
    trace: "retain-on-failure",
    // Lets a sandbox with a preinstalled browser skip `playwright install`.
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "pnpm exec tsx e2e/supabase-mock.ts",
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm build && pnpm start --hostname 127.0.0.1 --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}/`,
      env,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

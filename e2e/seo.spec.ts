import { editionTag, editionYear } from "../lib/edition";
import { APP_PORT, IDS } from "./fixtures";
import { expect, test } from "./test";

const ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const year = editionYear(Date.now());

test("robots.txt keeps the private and data routes out and points to the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const text = await response.text();
  for (const path of ["/admin", "/health", "/watch/live", "/watch/schedule"]) expect(text).toContain(`Disallow: ${path}`);
  expect(text).toContain("Allow: /");
  expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  // Previews are kept out by `noindex` on the page, which a crawler must be allowed to read.
  expect(text).not.toContain("at=");
});

test("the sitemap lists the three public pages with absolute addresses", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect([...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])).toEqual([`${ORIGIN}/`, `${ORIGIN}/road-to`, `${ORIGIN}/watch`]);
  expect(text).not.toContain("lastmod");
});

for (const [path, canonical] of [["/", "/"], ["/road-to", "/road-to"], ["/watch", "/watch"], [`/watch?slot=${IDS.now}&stream=twitch%3Astudio_cam`, "/watch"]] as const) {
  test(`${path} has a canonical link (${canonical}) and a description`, async ({ page }) => {
    await page.goto(path);
    // Next writes the root without a trailing slash; the two are the same address.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical === "/" ? ORIGIN : `${ORIGIN}${canonical}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{40,}/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
}

test("a preview is not canonical anywhere and stays out of search results", async ({ page }) => {
  await page.goto(`/?at=${new Date(Date.UTC(year, 0, 1, 5)).toISOString()}&speed=1`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
});

test("sharing a link shows an image, a title and a large card", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`^${ORIGIN}/opengraph-image`));
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", new RegExp(`^${ORIGIN}/twitter-image`));
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", editionTag(year));
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  for (const property of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const url = await page.locator(property).getAttribute("content");
    expect(url, property).toContain(ORIGIN);
    const image = await request.get(url!);
    expect(image.status(), property).toBe(200);
    expect(image.headers()["content-type"], property).toBe("image/png");
    expect((await image.body()).length, property).toBeGreaterThan(2_000);
  }
});

test("the first HTML already says what the page counts down to, and describes the site as data", async ({ request }) => {
  // React separates interpolated text with comment markers; the text a crawler reads is without them.
  const html = (await (await request.get("/")).text()).replaceAll("<!-- -->", "");
  // Before any script runs, a crawler reads this: the edition, the date and a structured description.
  expect(html).toContain(`Follow the countdown to January 1, ${year}`);
  const data = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);
  expect(data).toMatchObject({ "@context": "https://schema.org", "@type": "WebSite", name: editionTag(year), url: `${ORIGIN}/`, inLanguage: "en" });
});

test("the data endpoints are marked noindex", async ({ request }) => {
  for (const path of ["/health", "/watch/live?keys=twitch:vanderfondi", "/watch/schedule"]) {
    expect((await request.get(path)).headers()["x-robots-tag"], path).toBe("noindex");
  }
});

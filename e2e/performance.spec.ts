import { expect, test } from "./test";

// A budget on the JavaScript each page loads up front. The React/Next runtime is about 400 KB; the
// HLS and DASH players are another 1.4 MB and must stay behind the viewer's click, so a static
// import of either would blow these limits (the numbers have headroom over today's ~520-550 KB).
const BUDGET_BYTES = 700_000;

for (const path of ["/", "/road-to", "/watch"]) {
  test(`${path} loads within its JavaScript budget`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "the same bundles load on mobile");
    let scripts = 0;
    page.on("response", async (response) => {
      if (response.request().resourceType() === "script") scripts += (await response.body()).length;
    });
    await page.goto(path, { waitUntil: "networkidle" });
    expect(scripts, `script bytes on ${path}`).toBeLessThan(BUDGET_BYTES);
  });
}

test("the map and flags are cached for a day, not revalidated on every visit", async ({ request }) => {
  for (const path of ["/maps/time-zones.svg", "/flags/4x3/au.svg"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["cache-control"], path).toBe("public, max-age=86400, stale-while-revalidate=604800");
  }
});

test("the schedule is shared by the CDN for seconds (never kept by browsers), except deep links and previews", async ({ request }) => {
  const plain = (await request.get("/watch/schedule")).headers();
  // Browsers keep nothing; the CDN is told, by its own headers, to share for 5 seconds.
  expect(plain["cache-control"]).toBe("no-store, max-age=0");
  expect(plain["cdn-cache-control"]).toBe("public, max-age=5, stale-while-revalidate=10");
  expect(plain["vercel-cdn-cache-control"]).toBe("public, max-age=5, stale-while-revalidate=10");
  for (const query of ["?slot=11111111-1111-4111-8111-000000000001", `?at=${new Date().toISOString()}`, "?other=1"]) {
    const headers = (await request.get(`/watch/schedule${query}`)).headers();
    expect(headers["cache-control"], query).toBe("no-store, max-age=0");
    expect(headers["cdn-cache-control"], query).toBeUndefined();
    expect(headers["vercel-cdn-cache-control"], query).toBeUndefined();
  }
});

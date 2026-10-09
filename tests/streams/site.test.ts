import assert from "node:assert/strict";
import test from "node:test";
import { siteUrl } from "../../lib/site";

test("SITE_URL wins, then the Vercel production domain, then the deployment, then localhost", () => {
  assert.equal(siteUrl({ SITE_URL: "https://example.com", VERCEL_PROJECT_PRODUCTION_URL: "prod.example.app" }).href, "https://example.com/");
  assert.equal(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "prod.example.app", VERCEL_URL: "preview-abc.vercel.app" }).href, "https://prod.example.app/");
  assert.equal(siteUrl({ VERCEL_URL: "preview-abc.vercel.app" }).href, "https://preview-abc.vercel.app/");
  assert.equal(siteUrl({}).href, "http://localhost:3000/");
});

test("only an origin is accepted: HTTPS (or http on localhost), no credentials, path, query or fragment", () => {
  assert.equal(siteUrl({ SITE_URL: "https://example.com/" }).href, "https://example.com/");
  assert.equal(siteUrl({ SITE_URL: "http://127.0.0.1:3100" }).href, "http://127.0.0.1:3100/");
  for (const bad of ["http://example.com", "https://user:pw@example.com", "https://example.com/blog", "https://example.com/?x=1", "https://example.com/#top", "not a url", ""]) {
    assert.equal(siteUrl({ SITE_URL: bad, VERCEL_URL: "fallback.vercel.app" }).href, "https://fallback.vercel.app/", bad);
  }
});

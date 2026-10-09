/**
 * The public address of the site, for canonical links, the sitemap and share
 * images. `SITE_URL` wins; on Vercel the production domain is used (the same
 * for previews, so a preview never claims to be the canonical page); otherwise
 * localhost. Only an origin counts (HTTPS, or http on localhost): anything
 * else is ignored rather than trusted.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const candidates = [
    env.SITE_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`,
    env.VERCEL_URL && `https://${env.VERCEL_URL}`,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate.trim());
      const local = ["localhost", "127.0.0.1"].includes(url.hostname);
      if ((url.protocol === "https:" || (url.protocol === "http:" && local)) &&
          !url.username && !url.password && !url.search && !url.hash && (url.pathname === "/" || url.pathname === "")) {
        return new URL(url.origin);
      }
    } catch { /* not a URL: try the next one */ }
  }
  return new URL("http://localhost:3000");
}

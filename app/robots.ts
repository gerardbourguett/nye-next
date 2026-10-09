import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

// The private manager and the JSON endpoints the pages poll are not for search results.
// Previews (?at=) are kept out with `noindex` on the pages themselves, which a crawler can only
// see if it is allowed to fetch them, so they are not disallowed here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/health", "/watch/live", "/watch/schedule"] },
    sitemap: new URL("/sitemap.xml", siteUrl()).href,
  };
}

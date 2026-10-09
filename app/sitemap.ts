import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

// Three pages, and no `lastModified`: the content changes with the clock and the schedule, and a
// made-up date would only teach crawlers to ignore it.
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/road-to", "/watch"].map((path) => ({ url: new URL(path, siteUrl()).href }));
}

import type { NextConfig } from "next";

// Files in /public are served with `max-age=0`, so the 430 KB time-zone map and the flags would be
// revalidated on every visit. Their names do not change when their content does, so they are not
// `immutable`: a day fresh, then a week of serving the old copy while a new one is fetched.
const STATIC_ASSETS = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Data for the pages and for monitors, not for search results.
      ...["/health", "/watch/live", "/watch/schedule"].map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex" }] })),
      { source: "/maps/:path*", headers: [{ key: "Cache-Control", value: STATIC_ASSETS }] },
      { source: "/flags/:path*", headers: [{ key: "Cache-Control", value: STATIC_ASSETS }] },
    ];
  },
};

export default nextConfig;

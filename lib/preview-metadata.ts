import type { Metadata } from "next";

import { SHARE_ALT, SHARE_SIZE } from "@/lib/og-image";

/**
 * Share metadata for a preview: the title and description name the simulated
 * edition, for Open Graph and Twitter cards alike. A page's own `openGraph` or
 * `twitter` replaces the root layout's whole object, so everything the root
 * sets (site name, type, the large card) is repeated here, and so are the share
 * images: below the root segment the image files are only inherited through that
 * object, so without them a preview would be shared with no image.
 * `images: false` is for the home page, whose own image files are kept.
 */
export function previewSocial(edition: string, title: string, description: string, { images = true } = {}): Pick<Metadata, "openGraph" | "twitter"> {
  const image = (url: string) => ({ url, ...SHARE_SIZE, alt: SHARE_ALT });
  return {
    openGraph: { title, description, siteName: edition, type: "website", ...(images && { images: [image("/opengraph-image")] }) },
    twitter: { card: "summary_large_image", title, description, ...(images && { images: [image("/twitter-image")] }) },
  };
}

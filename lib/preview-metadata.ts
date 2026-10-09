import type { Metadata } from "next";

import { editionTag } from "@/lib/edition";
import { SHARE_ALT, SHARE_SIZE } from "@/lib/og-image";

/**
 * Share metadata for a preview: the title and description name the simulated
 * edition, for Open Graph and Twitter cards alike. A page's own `openGraph` or
 * `twitter` replaces the root layout's whole object, so everything the root
 * sets (site name, type, the large card) is repeated here, and so are the share
 * images: below the root segment the image files are only inherited through that
 * object, so without them a preview would be shared with no image. The images
 * are drawn for the simulated edition (`/share-image?year=`): the image files
 * follow the real clock and would contradict the title.
 */
export function previewSocial(year: number, title: string, description: string): Pick<Metadata, "openGraph" | "twitter"> {
  const image = { url: `/share-image?year=${year}`, ...SHARE_SIZE, alt: SHARE_ALT };
  return {
    openGraph: { title, description, siteName: editionTag(year), type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

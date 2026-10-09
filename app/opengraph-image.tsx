import { SHARE_ALT, SHARE_SIZE, shareImage } from "@/lib/og-image";

export const alt = SHARE_ALT;
export const size = SHARE_SIZE;
export const contentType = "image/png";

// Next passes its own props to this function: `shareImage` must not receive them as the edition.
export default async function Image() {
  return shareImage();
}

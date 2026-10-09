import type { Instrumentation } from "next";

import { describeRequestError } from "@/lib/health";

// One structured line per server error, so Vercel's logs can be searched for
// `request_error` by route and digest. Nothing is sent anywhere else.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.error(describeRequestError(error, request, context));
};

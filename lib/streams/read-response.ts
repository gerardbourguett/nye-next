import type { IncomingMessage } from "node:http";

/** What a status check needs from one HTTP answer: its status, where it redirects, and a capped body. */
export type ReadResponse = { status: number; location?: string; text: string };

/**
 * Reads one HTTP response under a byte cap. A redirect's body is never read:
 * the connection is closed as soon as `Location` is known, so a host cannot
 * keep a status check busy (or spend its bandwidth) by sending an endless
 * body with a redirect. A body over the cap, an error and a connection that
 * closes early all reject, and the connection is closed.
 */
export function readResponse(
  response: IncomingMessage,
  request: { destroy(error?: Error): unknown },
  maxBytes: number,
): Promise<ReadResponse> {
  return new Promise((resolve, reject) => {
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      const location = response.headers.location;
      response.destroy();
      resolve({ status, location, text: "" });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };
    response.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error("Response too large");
        finish(() => reject(error));
        request.destroy(error);
        response.destroy();
      } else chunks.push(chunk);
    });
    response.on("end", () => finish(() => resolve({ status, text: Buffer.concat(chunks).toString("utf8") })));
    response.on("error", (error) => finish(() => reject(error)));
    response.on("close", () => finish(() => reject(new Error("Connection closed before the response ended"))));
  });
}

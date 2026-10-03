import "server-only";

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";

import { isPublicAddress, isPublicHttpsUrl } from "./hostname";

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const ACCEPT = "application/vnd.apple.mpegurl, application/x-mpegurl, application/dash+xml, audio/mpegurl, text/plain, */*;q=0.5";

type LookupCallback = (error: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;

/**
 * Resolves like the system does but refuses any answer that is not a public
 * address. It runs when the socket connects, so a name that resolves
 * somewhere else by then (DNS rebinding) is refused too.
 */
function publicLookup(hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback) {
  dnsLookup(hostname, { all: true, family: options.family }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || !addresses.every((entry) => isPublicAddress(entry.address))) {
      return callback(Object.assign(new Error("Refused: not a public address"), { code: "ENOTPUBLIC" }));
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

type Response = { status: number; location?: string; text: string };

function once(url: URL, signal: AbortSignal, maxBytes: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "GET", lookup: publicLookup as never, signal,
      headers: { accept: ACCEPT, "user-agent": "nye-next status check" },
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.resume();
        resolve({ status, location: response.headers.location, text: "" });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) request.destroy(new Error("Response too large"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, text: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

/**
 * Reads a small text resource (a playlist or manifest) from a public HTTPS
 * address the admin supplied. Only public hosts are contacted (checked again
 * on every redirect and at connection time), at most three redirects are
 * followed, the body is capped, and the whole read has one deadline.
 */
export async function fetchPublicText(input: string, timeoutMs: number, maxBytes = MAX_BYTES): Promise<{ status: number; text: string; url: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = new URL(url);
    if (!isPublicHttpsUrl(target)) throw new Error("Refused: not a public HTTPS address");
    const response = await once(target, signal, maxBytes);
    // `url` is where the text really came from: relative references inside it resolve against that, not the first address.
    if (response.status < 300 || response.status >= 400) return { status: response.status, text: response.text, url };
    if (!response.location) throw new Error("Redirect without a location");
    url = new URL(response.location, url).href;
  }
  throw new Error("Too many redirects");
}

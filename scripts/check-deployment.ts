/**
 * Smoke test for a running deployment, for the parts the offline suites cannot
 * prove: that the pages answer, that the schedule is readable from the real
 * database, that the provider credentials reached the server, and what each
 * scheduled stream reports. It only reads public endpoints.
 *
 *   pnpm check:deployment https://your-site.example [--require-providers]
 *
 * With --require-providers a provider without credentials fails the run
 * (otherwise it is only a warning: without credentials the room says
 * "Scheduled" for everything, which is correct but not live data).
 */
import { editionTag, editionYear } from "../lib/edition";
import { capLiveKeys, MAIN_CHANNEL } from "../lib/streams/domain";

const [target, ...flags] = process.argv.slice(2);
if (!target || !/^https?:\/\//.test(target)) {
  console.error("Usage: pnpm check:deployment <https://site> [--require-providers]");
  process.exit(2);
}
const base = new URL(target);
const requireProviders = flags.includes("--require-providers");
let failures = 0;
const ok = (message: string) => console.log(`ok    ${message}`);
const warn = (message: string) => console.log(`warn  ${message}`);
const fail = (message: string) => { failures++; console.error(`FAIL  ${message}`); };

async function get(path: string) {
  const response = await fetch(new URL(path, base), { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  return { status: response.status, body: await response.text() };
}

async function main() {
  // A preview two days before the next January 1 must work on every page and stay out of search results.
  const preview = `at=${new Date(Date.UTC(editionYear(Date.now()), 0, 1) - 2 * 86_400_000).toISOString()}&speed=1`;

  for (const path of ["/", "/road-to", "/watch", `/?${preview}`, `/road-to?${preview}`, `/watch?${preview}`]) {
    try {
      const { status, body } = await get(path);
      if (status !== 200) fail(`${path} answered ${status}`);
      else if (path.includes("at=") && !/name="robots"[^>]*noindex|noindex[^>]*name="robots"/.test(body)) fail(`${path} (preview) is not marked noindex`);
      else ok(`${path} answered 200`);
    } catch (error) {
      fail(`${path} could not be reached: ${error instanceof Error ? error.message : error}`);
    }
  }

  try {
    const { body } = await get("/");
    // The heading itself: the tag also sits in the page's metadata, which would pass even with the heading missing.
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(body)?.[1].replace(/<!--[\s\S]*?-->|<[^>]+>/g, "").trim();
    const expected = editionTag(editionYear(Date.now()));
    if (heading === expected) ok(`home heading reads ${expected}`);
    else fail(`home heading reads ${JSON.stringify(heading ?? null)}, expected ${expected}`);
  } catch { /* reported above */ }

  const keys = new Set<string>([`twitch:${MAIN_CHANNEL}`]);
  try {
    const { status, body } = await get("/watch/schedule");
    const value = JSON.parse(body) as { slots?: { title: string; options: { provider: string; id: string }[] }[] };
    if (status !== 200 || !Array.isArray(value.slots)) fail(`/watch/schedule answered ${status} without a slot list (is Supabase configured?)`);
    else {
      ok(`/watch/schedule lists ${value.slots.length} slot(s)`);
      for (const slot of value.slots) for (const option of slot.options) keys.add(`${option.provider}:${option.id}`);
    }
  } catch (error) {
    fail(`/watch/schedule is not readable: ${error instanceof Error ? error.message : error}`);
  }

  try {
    // One request holds at most 24 keys and a bounded query: ask in as many as the schedule needs.
    type Status = { live: boolean; viewers?: number; title?: string };
    const statuses: Record<string, Status> = {};
    let providers: Record<string, boolean> | undefined;
    let remaining = [...keys];
    const unchecked: string[] = [];
    while (remaining.length > 0) {
      const batch = capLiveKeys(remaining);
      if (batch.length === 0) { unchecked.push(...remaining); break; } // a key too long for any request
      const query = new URLSearchParams({ keys: batch.join(",") });
      const { status, body } = await get(`/watch/live?${query}`);
      const value = JSON.parse(body) as { live?: Record<string, Status>; providers?: Record<string, boolean> };
      if (status !== 200 || !value.live || !value.providers) throw new Error(`answered ${status} without status`);
      Object.assign(statuses, value.live);
      providers ??= value.providers;
      remaining = remaining.filter((key) => !batch.includes(key));
    }
    ok("/watch/live answers");
    for (const [provider, configured] of Object.entries(providers ?? {})) {
      if (configured) ok(`${provider} credentials reached the server`);
      else (requireProviders ? fail : warn)(`${provider} has no credentials on the server, so ${provider} streams will always read "Scheduled"`);
    }
    for (const key of keys) {
      const info = statuses[key];
      const text = unchecked.includes(key) ? "not checked (the address is too long for a status request)"
        : info ? (info.live ? `LIVE${info.viewers === undefined ? "" : ` · ${info.viewers} watching`}` : "offline") : "unconfirmed";
      console.log(`      ${key.padEnd(48)} ${text}`);
    }
    if (unchecked.length > 0) warn(`${unchecked.length} stream(s) could not be checked`);
  } catch (error) {
    fail(`/watch/live is not readable: ${error instanceof Error ? error.message : error}`);
  }

  if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

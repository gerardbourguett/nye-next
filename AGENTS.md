<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commands and checks

- Use pnpm: `package.json` pins `pnpm@10.21.0`; `pnpm-lock.yaml` is the lockfile. Next.js is `16.3.2`, React is `19.2.8`.
- `pnpm-workspace.yaml` suppresses build scripts for `sharp` and `unrs-resolver`; preserve that policy when changing dependencies.

| Task (from repository root) | Command |
| --- | --- |
| Development | `pnpm dev` |
| Production build / serve | `pnpm build` / `pnpm start` (build first) |
| Repository lint | `pnpm lint` |
| Focused relay lint | `pnpm exec eslint app/road-to/page.tsx app/road-to/relay-board.tsx data/relay.ts` |
| Generate route types, then typecheck | `pnpm exec next typegen && pnpm exec tsc --noEmit` |
| End-to-end (Playwright, builds the app) | `pnpm test:e2e` |

- `RootLayout` uses generated global `LayoutProps<"/">`; generate types before checking a fresh checkout. Do not hand-edit `next-env.d.ts` or `.next/` types.
- ESLint uses Next core-web-vitals and TypeScript presets in `eslint.config.mjs`; lint is a separate script, not a substitute for typechecking.
- Offline Node/tsx tests: `pnpm test:streams` and `pnpm test:timezones`; no formatter is configured. Mocked checks do not prove deployed Supabase RLS/Cron/Edge behavior; lint/typecheck are not behavioral tests.
- `.github/workflows/ci.yml` runs on pull requests and `main`: lint, typegen + typecheck, both offline suites and a build without Supabase settings, then the E2E job.
- E2E (`e2e/`, `playwright.config.ts`): a production build against `e2e/supabase-mock.ts`, a stand-in for the PostgREST/auth endpoints the public pages read, serving test-labelled slots from `e2e/fixtures.ts` relative to the current time. Provider credentials are blanked and Twitch/YouTube requests are answered locally; every test fails on console errors. Desktop and Pixel 7 projects, `America/Santiago` timezone. Locally, `E2E_CHROMIUM=<path>` uses a preinstalled browser instead of `playwright install`. It does not cover `/admin` (needs a Supabase session) or real provider APIs.
- TypeScript is strict; `@/*` maps to the repository root, not `src/` (`tsconfig.json`).

## Routes and time semantics

- `/` is the client countdown in `app/page.tsx`; `/road-to` computes bands in its server `page.tsx` and passes them to client `relay-board.tsx`.
- Home `START`/`TARGET` are viewer-local calendar dates, not UTC. Keep clock reads inside the effect and the initial countdown state `null` to preserve matching initial markup.
- The relay likewise starts `now`/`viewer` as `null`; viewer timezone detection and localized arrival labels happen only after mount. Home ticks every second; relay status every 30 seconds.
- The edition year has one source: `editionYear(now)` in `lib/edition.ts`. Edition Y lasts until 12:00 UTC on January 1 of Y (UTC−12's midnight, end of the wave), then becomes Y + 1. Never hardcode a year in routes, labels or metadata.
- Server code reads the edition via `requestEdition()` (`lib/edition-server.ts`, which calls `connection()`), so `/` and the root `generateMetadata` render per request instead of freezing a build-time year. Child routes set plain titles; the root title template appends `#<year>Live`.
- Home receives the request edition as `initialYear` and re-derives it on every tick: after the viewer's own midnight it shows an "It's <year> here" state until the wave ends, then counts toward the next edition. The relay asks for one `router.refresh()` when the client clock enters a new edition.

## Relay data contract

- `/road-to` uses `lib/timezones/server.ts` for a bounded no-store public snapshot read, falling back to `data/timezones.json`. `getRelayBands(year, zones?)` stays pure/shared with bundled defaults; the year is always explicit; never import server/database modules into it. `public/data/timezones.json` remains unused.
- Visible boards refresh catalog props every five minutes and on visibility return; the 30-second clock remains separate. Daily IANA automation setup is manual in `docs/timezone-sync-setup.md`; catalog updates do not update runtime ICU rules.
- `resolveRolloverArrival()` recomputes offsets with `Intl` at the target New Year, then refines the arrival instant. Do not use the JSON's snapshot `gmtOffset` or the viewer's current offset: DST can differ.
- `getRelayBands()` groups by offset minutes and sorts descending (earliest midnight first); places sort by city. Each band's `headline` is the first `HEADLINE_ZONES` entry it contains (matched by IANA zone, never offset), else its first place; rows list the headline first. Preserve half/quarter-hour offsets and derive counts from `bands.length`, never a fixed 24.
- Unsupported IANA zone names are skipped by `getRelayBands()`; runtime `Intl` timezone support can change coverage. Viewer detection failures omit the marker rather than invent an offset.
- Stream options may carry an optional IANA `zone` (the place celebrating). `/road-to` loads published slots in `editionStreamWindow(year)` via `relaySchedule()` (bounded, failure → no stream links) and `crossingStreams()` in `lib/streams/relay-link.ts` groups them by the zone's offset at the target New Year, matching `RelayBand.offsetMinutes`. Links go to `/watch?slot=&stream=`; the room selects that option when its hour is active and never auto-loads a player.
- Slots default to one hour in the admin but may last whole minutes from 5 minutes to 7 days (`validateWindow`, SQL `slot_duration` in `202610020001_flexible_slot_duration.sql`), e.g. for rehearsals. Duration is elapsed time, so DST never stretches it; published slots still may not overlap.
- `/watch` is laid out like Twitch: channel rail (this slot's 1–4 streams, then up next), player with stream info, chat (always `MAIN_CHANNEL` vanderfondi's Twitch chat, plus the selected stream's Twitch or live YouTube chat), and schedule cards. Players and chats load only on click.
- Live status comes from `/watch/live?keys=` (`lib/streams/live.ts`, CDN `s-maxage=30`, per-instance 60 s cache, 4 s timeouts) using optional server env `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` (Helix streams/users) and `YOUTUBE_API_KEY` (videos.list; channels via their public uploads feed). Without them nothing is called and streams read "Scheduled"; "Live"/viewers only ever show provider-confirmed data. Parsers in `live-parse.ts` are pure and tested.
- Providers are `twitch`, `youtube` (one video) and `youtube_channel` (the channel's current live, `UC…` ID). Option validation lives in both `lib/streams/domain.ts` and the SQL `valid_stream_options` (latest: `202610010001_stream_option_places.sql`); change them together. Client bundles use `lib/zones.ts` for zone names, not `data/relay.ts`.
- Interactive relay (`relay-controls.tsx`): `Countdown` ticks every second on its own so the board keeps its 30-second tick; "Find a place" scrolls to and marks a place; "Set my place" stores a zone in `localStorage` (`relay:place`) that overrides the device timezone for the marker. All of it starts after mount.
- Map (`relay-map.tsx`): Wikimedia Commons' public-domain "World Time Zones Map.svg" (Heitordp; CIA outline, IANA zones), regenerated with `pnpm exec tsx scripts/generate-map-data.ts` into `public/maps/time-zones.svg` (one `<g id="o<minutes>">` per offset at New Year) and `data/map-offsets.json` (source revision, crop, offsets). The script maps the source's per-region standard offsets, adds southern summer time, overrides Morocco/Western Sahara to IANA, and fails on any other disagreement with the catalog. Layers are `<use>` buttons (keyboard-selectable); the crossing list stays the accessible source. A test requires a region for every crossing.
- Preview mode: `/road-to?at=<ISO>&speed=<1–3600>` (`lib/relay-clock.ts`). The server picks the edition from the simulated instant; the client advances it from a mount-time anchor and labels the page as a preview. It never changes `/` or `/watch`.
- “You are here” matches the viewer's offset at the target crossing, not a specific city or country. Flags use `/flags/4x3/<lowercase countryCode>.svg`; preserve that mapping when changing data/assets.

## UI and product boundaries

- Tailwind v4 is wired through `@tailwindcss/postcss`; CSS imports, theme tokens and reduced-motion rules live in `app/globals.css`, not a Tailwind JS config.
- `components.json` selects shadcn `base-sera`; the local button wraps `@base-ui/react/button`, not Radix. Check its actual props before copying component examples; merge classes with `cn()` from `lib/utils.ts`.
- `app/layout.tsx` loads Archivo and Big Shoulders through `next/font/google` and wraps routes in the class-based, system-default theme provider. README's Geist description is stale.
- `PRODUCT.md` supplies product constraints: the channel is `vanderfondi`, future hourly slots must support 1–4 streams, and placeholder programming must be labeled. Do not invent lineup or audience data.
- Older broadcast-layout comments in `app/layout.tsx` and `app/globals.css` do not describe the current route markup; inspect the pages before assuming a 24-band studio layout or active edition-color switching.
- `CLAUDE.md` delegates to this file; keep repository guidance here and outside the managed Next.js block.

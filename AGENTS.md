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

- `RootLayout` uses generated global `LayoutProps<"/">`; generate types before checking a fresh checkout. Do not hand-edit `next-env.d.ts` or `.next/` types.
- ESLint uses Next core-web-vitals and TypeScript presets in `eslint.config.mjs`; lint is a separate script, not a substitute for typechecking.
- Offline Node/tsx tests: `pnpm test:streams` and `pnpm test:timezones`; no formatter is configured. Mocked checks do not prove deployed Supabase RLS/Cron/Edge behavior; lint/typecheck are not behavioral tests.
- TypeScript is strict; `@/*` maps to the repository root, not `src/` (`tsconfig.json`).

## Routes and time semantics

- `/` is the client countdown in `app/page.tsx`; `/road-to` computes bands in its server `page.tsx` and passes them to client `relay-board.tsx`.
- Home `START`/`TARGET` are viewer-local calendar dates, not UTC. Keep clock reads inside the effect and the initial countdown state `null` to preserve matching initial markup.
- The relay likewise starts `now`/`viewer` as `null`; viewer timezone detection and localized arrival labels happen only after mount. Home ticks every second; relay status every 30 seconds.
- Edition changes span separate anchors: home dates, labels and accessibility text; `data/relay.ts`'s `ROLLOVER_YEAR`; and root metadata in `app/layout.tsx`. Changing the relay constant alone does not update home.
- Current routes stay fixed on 2027; home clamps at zero after midnight. Automatic next-edition rollover and hourly stream programming in `PRODUCT.md` are requirements, not implemented behavior.

## Relay data contract

- `/road-to` uses `lib/timezones/server.ts` for a bounded no-store public snapshot read, falling back to `data/timezones.json`. `getRelayBands(zones?)` stays pure/shared with bundled defaults; never import server/database modules into it. `public/data/timezones.json` remains unused.
- Visible boards refresh catalog props every five minutes and on visibility return; the 30-second clock remains separate. Daily IANA automation setup is manual in `docs/timezone-sync-setup.md`; catalog updates do not update runtime ICU rules.
- `resolveRolloverArrival()` recomputes offsets with `Intl` at the target New Year, then refines the arrival instant. Do not use the JSON's snapshot `gmtOffset` or the viewer's current offset: DST can differ.
- `getRelayBands()` groups by offset minutes and sorts descending (earliest midnight first); places sort by city. Preserve half/quarter-hour offsets and derive counts from `bands.length`, never a fixed 24.
- Unsupported IANA zone names are skipped by `getRelayBands()`; runtime `Intl` timezone support can change coverage. Viewer detection failures omit the marker rather than invent an offset.
- “You are here” matches the viewer's offset at the target crossing, not a specific city or country. Flags use `/flags/4x3/<lowercase countryCode>.svg`; preserve that mapping when changing data/assets.

## UI and product boundaries

- Tailwind v4 is wired through `@tailwindcss/postcss`; CSS imports, theme tokens and reduced-motion rules live in `app/globals.css`, not a Tailwind JS config.
- `components.json` selects shadcn `base-sera`; the local button wraps `@base-ui/react/button`, not Radix. Check its actual props before copying component examples; merge classes with `cn()` from `lib/utils.ts`.
- `app/layout.tsx` loads Archivo and Big Shoulders through `next/font/google` and wraps routes in the class-based, system-default theme provider. README's Geist description is stale.
- `PRODUCT.md` supplies product constraints: the channel is `vanderfondi`, future hourly slots must support 1–4 streams, and placeholder programming must be labeled. Do not invent lineup or audience data.
- Older broadcast-layout comments in `app/layout.tsx` and `app/globals.css` do not describe the current route markup; inspect the pages before assuming a 24-band studio layout or active edition-color switching.
- `CLAUDE.md` delegates to this file; keep repository guidance here and outside the managed Next.js block.

# The relay running order

`/road-to` is an **Operate** surface for viewers checking the global midnight
relay beside vanderfondi's broadcast. Its task is to show the next crossing,
the viewer's crossing, and the complete ordered journey without competing
with the stream. This document applies only to this route.

## Direction

Keep the original `/road-to` palette in an open running order: shared theme
backgrounds and text, aligned UTC offsets and local arrival times, and city
names as the primary list content. The user rejected the redesign's palette
change; the home page's studio colors do not authorize colors on this route.
No decorative charts, card grid, fabricated programming, or live-stream claim.

The first viewport establishes the relay, its real progress, the next place
to cross, and the viewer's midnight. Anchor links take the viewer directly
to the corresponding row. All rows retain the shared background; completed
offsets and the viewer marker use the original emerald highlight. Explicit
state text distinguishes the next and completed crossings without colored fills.

## Local visual system

| Element | Implementation |
| --- | --- |
| Typography | Existing Archivo for controls, cities, and tabular times; existing Big Shoulders for the title only |
| Color | Original `--background`, `--foreground`, `--muted-foreground`, and `--border` in both themes; city text uses foreground at 90%; crossed offsets, viewer highlights, and progress count use Tailwind emerald-500 (`oklch(69.6% 0.17 162.48)`); progress fill uses foreground |
| Layout | Maximum 76rem; aligned identity, places, and arrival columns on desktop; offset/time above full-width places on mobile |
| Detail | Thin rules, square surfaces, native disclosures, existing SVG flags, Lucide icons |
| Motion | 200ms progress transform and crossing color transitions; disabled for reduced motion |
| Navigation | Home, real Twitch channel, next crossing, viewer crossing, skip link, and back to top |

## Behavioral boundaries

- Server-provided bands remain ordered and unfiltered. Every city, country
  flag, UTC offset, local arrival, and place count stays accessible.
- Initial clock/viewer state remains null; local labels appear after mount.
  Existing target-year offset resolution and 30-second updates are unchanged.
- Viewer matching uses the offset at New Year, not a city or current-season offset.
- First, in-progress, completed, unmatched-viewer, and empty-data states have
  truthful text. Completion stays on the fixed 2027 edition; automatic rollover
  and hourly programming are not implemented by this redesign.
- The CSS module is route-local. Home, global layout, shared tokens, and relay
  data logic are outside this change.

## Verification boundary

Focused ESLint and generated-route TypeScript checks pass. Controlled-hook React
server-render assertions cover initial, pre-crossing, exact-crossing, completed,
unmatched-viewer, and empty states, along with full city/flag retention and
clock cleanup. Earlier numeric contrast checks covered the rejected palette,
not this restoration of the original shared theme colors.
These checks do not establish browser layout, real hydration, keyboard behavior,
or visual finish. Desktop/mobile browser inspection and independent review remain
pending; no browser tooling was installed for this change.

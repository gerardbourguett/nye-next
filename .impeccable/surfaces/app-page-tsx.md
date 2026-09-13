---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Surface: the #2027Live board (`app/page.tsx`)

## Scope and mode

The single route of the app: a second-screen companion open beside the vanderfondi New Year's Eve broadcast. **Operate**, in a celebration register — the visitor is completing a task (know where midnight is, decide what to watch), not contemplating the page. Scanability and state legibility outrank expression; the party lives in the palette and the choreography, not in ornament.

## Audience and job

Twitch viewers with the stream on their main screen and this page on a phone or second monitor, across a session that can run more than 24 hours. They glance rather than read. The one-second answer they came for is **how long until their own midnight**; the thing worth staying for is **the wave crossing the planet**.

## Action and content

- Primary action: pick a stream for the current hour from the one-to-four options in the lower-third strip, or open `twitch.tv/vanderfondi`.
- Real content: the Twitch channel, and the timezone/city/offset data (facts, not fabrication).
- Placeholder content: all programming — titles, hosts, thumbnails. Must ship visibly marked as placeholder until a real lineup exists.

## Direction

**The Election Night Desk.** A 26-hour live special following a result that crosses the map is structurally an election night, so the surface is the desk: 24 timezone bands that get *called* as their midnight lands. Chosen by the user over the roll's assignment (Pyrotechnic Catalog); ranked 1 of 7 on the grounded list; seed key `551e9ef7`.

Raises carried in from declined challengers: the meridians are the grid, not a rows-and-columns block (Tensegrity Column); streams ship as real video surfaces at scale, not text rows (Vertical Video Feed).

## Memorable moment

**THE CALL.** A band floods with the edition accent in a horizontal wipe, the city snaps to accent, a `CALLED` stamp wipes in like a lower-third, and the coverage meter advances. It fires 24 times across the night, and the accumulated gold is the real progress indicator — the color is the clock.

## Constraints

- Not dark-and-sober: the ground is saturated cobalt, and the accent floods the page as the night progresses. Explicit user veto on a page that is only dark and restrained.
- Never competes with the stream for attention.
- The lineup template must read correctly at 1, 2, 3 and 4 options.
- The surface owns its ground and ignores the light/dark theme; broadcast graphics have no light mode.
- Code, comments and UI copy in English.

## Unresolved

- Whether streams embed in-page or link out to Twitch.
- Where the hourly lineup data comes from; no source exists yet.
- The 2027 edition accent is committed as gold, 2028 as orange (user-bound). Later editions undecided.
- Whether the pre-broadcast promotional role belongs on this surface or a separate one.

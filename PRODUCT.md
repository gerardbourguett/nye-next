# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Twitch viewers watching the vanderfondi New Year's Eve special. They keep this page open on a second screen or on their phone while the stream plays, across a session that can run more than 24 hours as midnight crosses the globe. They dip in and out rather than reading continuously — they glance to answer "where is it already the new year?" and "what am I about to watch next?"

Not yet confirmed as a design target: people arriving from social links before the broadcast starts, who only need to know when to tune in.

## Product Purpose

A companion hub for a live New Year's Eve broadcast. It turns "new year" from a single moment into the ~26-hour global relay it actually is, and tells the viewer which stream to watch during each hour of that relay. Success is a viewer who keeps the page open all night and returns to it between celebrations — not one who reads a number once and closes the tab.

## Positioning

Most countdowns count to one midnight: the viewer's own. This one follows midnight as it travels. Every timezone crosses in turn, and each crossing is an event with programming attached. The mechanism a neighboring countdown page cannot truthfully copy is the pairing of the rolling midnight wave with the hour-by-hour stream lineup of vanderfondi's broadcast.

## Operating Context

- Runs alongside a live Twitch stream; the page is never the only thing on the viewer's screen.
- Used across a very long session spanning a full day/night cycle, on desktop second screens and on phones.
- The working unit of time is the hour: each hour of the broadcast has its own slot and its own set of streams.

## Capabilities and Constraints

- Local-time countdown to the viewer's own midnight (the current edition, resolved by `lib/edition.ts`; after the last timezone crosses at 12:00 UTC on January 1 it rolls to the following year).
- Rolling midnight wave across timezones: which regions have already entered the new year, which are next.
- Curated celebrations anchored to that wave (named city events at their local midnight).
- Per-hour stream slots: each hour of the broadcast holds **one to four** stream options. The page must be a template that accepts this full range, not a layout tuned to a single count.
- **Year rollover (implemented without per-edition accent colors):** when the target midnight passes, the surface does not end. It re-identifies as `#2028Live` and begins counting toward the following January 1. Each edition carries its own accent color; orange is bound to 2028.
- Confirmed viewing room: Twitch and YouTube embeds, one selected player at a time, no autoplay, and direct provider links as fallback.
- Confirmed programming management: a private admin panel, Supabase authentication with explicit admin membership, and PostgreSQL persistence for slots with one to four options. Slots default to one hour but may run 5 minutes to 7 days so rehearsals can stay on air. Visitors do not need accounts.
- Explicitly undecided: whether the pre-broadcast promotional role is in scope; the accent color for the 2027 edition. The viewing room and admin panel preserve the incumbent semantic theme palette and emerald accents, without a global redesign.

## Brand Commitments

- Name pattern `#<year>Live`, currently `#2027Live`, rolling forward each edition.
- Twitch channel `vanderfondi` — the real and only channel behind the broadcast.
- A per-year accent color, with orange bound to the 2028 edition. User-volunteered and binding; no other visual direction is committed.

## Evidence on Hand

- Real: the Twitch channel `vanderfondi`.
- Must not be fabricated: the hourly stream lineup, the list of covered cities or timezones, viewer counts, past-edition history, sponsors, or any testimonial. Placeholder programming must be visibly marked as placeholder.
- `public/` currently contains only create-next-app SVGs. No logo, photography, or brand assets exist yet.

## Product Principles

1. **The night is the unit, not the moment.** Design for a session spanning ~26 hours and many midnights, not for one number reaching zero.
2. **Never dead.** Every state — hours before, mid-wave, after the last midnight — must have something true to show. The surface hands off to the next edition instead of freezing.
3. **The stream is the point.** The page routes attention back to what is playing; it never competes with the broadcast for that attention.
4. **One to four, always.** The hourly lineup is a template with a real range. A layout that only reads correctly at exactly four options is broken.
5. **Say only what is true.** With no data source yet, placeholder content is labeled as placeholder rather than dressed up as real programming.

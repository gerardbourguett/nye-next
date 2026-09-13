# Enable the viewing room and private schedule manager

The local implementation adds `/watch`, `/admin`, and `/admin/login`. Remote database
state has not been verified. A successful login with an unavailable permission query
does not prove that a table or membership is missing. Complete these manual checks
before publishing real programming. No sample lineup or credentials are included.

## Quick path

1. **Select your existing Supabase project and existing Auth user.** No new account
   is needed or created. In SQL Editor, run the read-only object precheck below.
2. Only if **both stream tables are absent**, execute
   [`202609130001_stream_schedule.sql`](../supabase/migrations/202609130001_stream_schedule.sql)
   once. The migration is transactional and versioned; record that it was applied.
   Do not rerun it against existing tables or bypass an error. If either table exists,
   reconcile the migration history and definitions first; do not drop/recreate data.
3. In **Authentication → Providers → Email**, enable email/password sign-in. In
   Auth settings, **disable “Allow new users to sign up”**. Keep it disabled;
   removing the signup UI alone does not disable Supabase's signup API.
4. In **Authentication → Users**, locate your one existing user. Keep that identity;
   do not create, invite, or auto-promote another account. Any password recovery
   remains owner-managed; this app has no invite, OAuth, or password-reset callback.
5. Copy the existing user's UUID from Authentication → Users. As the database owner in
   the SQL Editor, grant membership using the template below. Auth identity alone
   grants **no** admin permission. Never bootstrap by user-editable metadata.
6. Keep your existing `.env.local`; do not overwrite it. If starting a fresh checkout,
   use `.env.example` as a template and privately supply the project's URL and
   **publishable key** from its Connect/API Keys screen. Set the same two variables
   in the deployment environment. Restart the dev server after changes.
7. Run `pnpm dev`, open `/admin/login`, create a draft, and then publish it. Visit
   `/watch` to verify the current hour and alternatives. Future slots appear under
   Coming up; nothing is labeled live merely because it is scheduled.

```sql
-- Read-only object precheck, BEFORE running any migration:
select to_regclass('public.stream_admins') as stream_admins,
       to_regclass('public.stream_slots') as stream_slots;
```

Once both objects are confirmed, distinguish missing membership from query failure:

```sql
-- Owner-only read; substitute the UUID of your existing verified Auth user.
select exists (
  select 1 from public.stream_admins
  where user_id = '<verified-auth-user-uuid>'::uuid
) as is_stream_admin;

-- Replace the placeholder with the verified Auth user's UUID, then execute as owner.
insert into public.stream_admins (user_id)
values ('<verified-auth-user-uuid>'::uuid)
on conflict (user_id) do nothing;

-- To revoke schedule access, execute as owner:
delete from public.stream_admins
where user_id = '<verified-auth-user-uuid>'::uuid;
```

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project HTTPS URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public key beginning `sb_publishable_` |

Only modern publishable keys are accepted. Do not put a secret key, legacy
service-role JWT, database password, or owner credential in either variable.
The Next.js app has no service-key dependency (the separate timezone Edge worker
does). Missing/invalid configuration renders safe
unavailable/setup states rather than taking down the existing countdown or relay.

If objects and membership exist but the permission query still fails, check this
project's RLS policies/grants against the migration and verify your private app
configuration points to the intended project. Do not grant access by user metadata
or assume another account is needed. For daily IANA automation, continue with
[timezone sync setup](timezone-sync-setup.md) after these stream prerequisites.

## Scheduling rules

- A slot is independent of the relay timezone bands. Start is inclusive, end is
  exclusive, and duration is exactly one elapsed hour. UTC timestamps are stored.
- The editor labels the browser's IANA timezone and previews the UTC window.
  Invalid calendar dates, nonexistent DST wall times, repeated DST times, and
  timezone changes are rejected rather than shifted silently. Use an unambiguous
  time or temporarily use a browser/system timezone of UTC for transition hours.
- One to four unique options are stored as an ordered JSONB array in the same
  row. One SQL write atomically replaces the title, window, publication state, and
  options. Both server validation and SQL constraints validate count and IDs.
- The first option is the default. Moving an option up changes its order. Accepted
  sources are HTTPS Twitch channel URLs/names, or YouTube video IDs and watch,
  live, shorts, embed, and youtu.be URLs. URLs are parsed; query parameters are
  discarded. Channel/playlist IDs, Twitch VODs/clips, arbitrary URLs, and iframe
  HTML are not supported. A syntactically valid ID is not proof a video exists.
- Drafts stay private. PostgreSQL's GiST exclusion constraint rejects intersecting
  **published** ranges, including concurrent attempts; exactly adjacent hours are
  allowed. Drafts may overlap. Unpublishing and deleting require confirmation.
- The room requests only published rows, using an anonymous server-side client,
  even when the viewer is signed in as an admin. Its bounded window covers the
  previous 24 hours and next 14 days; Coming up shows the next 12 slots. The admin
  list shows the latest 200 slots by start time; a known slot's edit URL still
  loads it independently. Larger archives need a future pagination extension.
- The room refreshes every 30 seconds (12-second request timeout), advances slot
  boundaries every second using the last server clock sample, and falls back to
  the first option if a selection is removed. Only one iframe can exist. A slot
  transition or option removal closes the old player; the next player requires
  another Load action. After 90 seconds without a fresh schedule, the player is
  removed rather than presenting an unverified schedule as current.
- Editors use last-write-wins updates. Coordinate simultaneous editors; revision
  conflict detection is not implemented. If a write times out, reload before
  retrying: a database commit may have succeeded even if the response was lost.

## Embeds and deployment

**Deploy on a Next.js-capable server over HTTPS. Hosting is not prescribed.**
Do not configure a CDN to cache `/admin`, its Server Action responses, or
`/watch/schedule`. Auth cookie responses must remain private/no-store. Preserve
forwarded host/origin headers and Next's default same-origin Server Action CSRF
checks; do not add wildcard `allowedOrigins`. Retain Supabase's Auth rate limits
and configure deployment-level login abuse protection before public launch.

- Twitch requires SSL, a `parent` hostname, and a minimum 400×300 player. The app
  derives `parent` from `window.location.hostname` **after mount**, without a port.
  Preview domains work with their actual hostname when served over HTTPS. This
  app assumes it is the top-level page, not nested inside someone else's iframe.
- On HTTP (including ordinary `pnpm dev`) or a player area narrower than 400px,
  Twitch uses the direct-link fallback. Test embeds on a legitimate HTTPS local
  development origin or authorized HTTPS deployment; do not disable browser
  security. YouTube requires at least 200×200; this player reserves 300px height.
- Loading a player connects the browser to Twitch/YouTube. No provider requests
  occur for an iframe until the visitor chooses Load. Neither provider autoplays;
  the visitor then uses its native Play control. Address privacy/consent and
  provider terms applicable to your audience before launch.
- Offline, embed-disabled, age/region-restricted, ended, and unavailable media
  remain provider-owned states. The app does not inspect cross-origin iframe
  contents or claim to detect online status. A direct provider link is always
  available for the selected stream, and upcoming options have direct links too.
- If introducing a Content Security Policy later, permit the required provider
  frame origins (`https://player.twitch.tv`, `https://www.youtube.com`) and verify
  the complete policy in a browser. Do not strip the normal HTTPS referrer from
  YouTube requests; the iframe uses `strict-origin-when-cross-origin`.

## Security and database validation before launch

Server Actions verify identity with `auth.getUser()`, then read protected
membership for **every** mutation. Private reads use the same guard. `proxy.ts`
refreshes cookies for `/admin` only, propagating request and response cookies and
no-store headers; proxy navigation is not the authorization boundary. No signup,
self-promotion, arbitrary redirect, or unauthenticated mutation API exists.

The migration grants anonymous users SELECT only, authenticated users writes
subject to RLS, and no application role membership writes. The sole membership
SELECT policy exposes only the current user's own membership. Test RLS with the
actual `anon`/`authenticated` roles or their public API clients, **not** only the
dashboard owner, which bypasses RLS. In an isolated test project:

| Check | Expected result |
| --- | --- |
| Anonymous SELECT | Published rows only; no drafts or memberships |
| Anonymous INSERT/UPDATE/DELETE | Permission denied |
| Authenticated non-admin SELECT | Published rows only; no drafts |
| Authenticated non-admin write | No row changed / RLS violation |
| Non-admin or admin membership INSERT/UPDATE/DELETE | Permission denied; self-promotion impossible |
| Confirmed admin SELECT/write | Drafts readable; valid slot creation, editing, deletion succeed |
| Owner removes membership, same session retries | Private read and write denied immediately by policy |
| 0 or 5 options, invalid provider/ID, duplicate source, blank label | Check constraint violation, entire write rolled back |
| Wrong duration or out-of-range dates | Check constraint violation |
| Two overlapping published slots | Exclusion violation (`23P01`) |
| Adjacent published slots / overlapping drafts | Allowed |
| Concurrent overlapping publish in two transactions | One waits, then fails if the other commits |
| Edit both options and window to an invalid payload | Previous row remains completely unchanged |

To exercise a role in the SQL Editor's test transaction, use `begin;`,
`set local role authenticated;`, then
`select set_config('request.jwt.claim.sub', '<test-user-uuid>', true);` before
queries. Use separate transactions for expected failures and finish with
`rollback;`. For anonymous checks use `set local role anon;`. Seed real test Auth
users and rows as owner first. Do not leave fabricated test programming published
in the production project. Verify the public API behavior as well as SQL roles.

## Local verification and remaining checks

```sh
pnpm test:streams
pnpm lint
pnpm exec next typegen && pnpm exec tsc --noEmit
git diff --check
```

`test:streams` uses Node's test runner through `tsx`. Tests execute URL parsing,
option constraints, UTC windows and overlap logic, DST validation, selection
fallback, and the authorization adapter seam. They do **not** prove deployed
RLS, real sessions/cookie refresh, CSRF transport, or provider playback. No
production build or browser tooling installation is required for these checks.

Before launch, run the policy matrix above and one desktop/mobile browser batch
covering both themes, keyboard navigation, narrow-screen fallback, missing config,
login failure/success/revocation, create/edit/delete feedback, slot boundaries,
removed selections, recovery after network loss, and no autoplay. No browser or
live Supabase verification was performed as part of the local implementation.

### Reviewable local work units

No commits or staging are performed by this implementation. Suggested boundaries:

1. **Schedule/security contract:** domain/time/authorization modules and tests,
   Supabase helpers, proxy, migration, dependencies, and this setup guide. Rollback
   removes the new schedule backend only; do not reverse a deployed migration
   without a data backup and separate authorization.
2. **Public room:** `app/watch`, shared `components/streams`, room design notes,
   and the minimal relay navigation link. Rollback restores that link and removes
   the room without changing countdown/timezone logic.
3. **Private management:** `app/admin` and its design notes. Rollback removes the
   panel without granting anyone extra database permissions.

These are review boundaries, not independent deployed releases. Runtime backend
and browser harnesses are pending setup/authorization; unit checks are not substitutes.

## Source documentation

- [Supabase Next.js server-side Auth](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Twitch embed requirements](https://dev.twitch.tv/docs/embed/)
- [Twitch iframe parameters](https://dev.twitch.tv/docs/embed/video-and-clips/)
- [YouTube player parameters](https://developers.google.com/youtube/player_parameters)
- Installed Next.js 16.3.2 guides: `node_modules/next/dist/docs/01-app/` (Proxy,
  Server Actions and Mutations, and async cookies).

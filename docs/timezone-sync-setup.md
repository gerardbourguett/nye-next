# Enable daily IANA timezone catalog updates

**Apply the SQL yourself, deploy the protected function, test one sync, then enable
the daily job.** Nothing here has connected to your Supabase project, executed SQL,
deployed a function, or activated Cron. Your remote database state is unknown.
The relay works from its bundled fallback until a validated snapshot is available.

## 1. Confirm the database prerequisites

Complete [stream setup](streaming-setup.md#quick-path) using your **existing Auth
user**, not a new account. Keep signup disabled. The stream migration must precede
the timezone migration because diagnostics use `stream_admins` membership.

Run this read-only precheck in SQL Editor:

```sql
select to_regclass('public.stream_admins') as stream_admins,
       to_regclass('public.stream_slots') as stream_slots,
       to_regclass('public.timezone_catalog') as timezone_catalog,
       to_regclass('public.timezone_sync_status') as timezone_sync_status;
```

Once the stream prerequisites exist and **both timezone objects are absent**, run
[`202609130002_timezone_catalog.sql`](../supabase/migrations/202609130002_timezone_catalog.sql)
once as owner. Record the applied version. If either timezone object already exists,
stop and reconcile migration history and definitions; do not drop tables or blindly
rerun a versioned migration. No seed catalog or fake success is inserted.

## 2. Configure and deploy the Edge Function

1. Generate a private random secret (at least 32 random bytes encoded as hex, 64
   characters; maximum accepted length 256) with your password manager.
2. In **Edge Functions → Secrets**, set `TIMEZONE_SYNC_SECRET` to that value.
   Never put it in a public variable, source file, chat, or committed SQL.
3. The worker uses the platform-provided `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. Confirm these built-in variables are available for
   your function. This implementation requires that service-role JWT; it does not
   treat a modern `sb_secret_` key as a JWT. Do not copy it into the Next.js app.
4. From this checkout, with a Supabase CLI you independently installed and an
   account/session you explicitly choose, run the manual deployment command below.
   Authenticate yourself if needed; no agent should discover or reuse a session.

```sh
# Manual only: replace the placeholder locally. Do not run db push.
supabase functions deploy timezone-sync --project-ref <your-project-ref> --no-verify-jwt
```

`supabase/config.toml` disables gateway JWT verification **only for this function**.
The handler requires `x-timezone-sync-secret` and checks it before any database
operation. A publishable key or ordinary Auth JWT alone cannot trigger sync. No
CORS access or body-supplied source URL is supported. Keep this application-level
check when changing deployment settings. Rotate the secret in both Edge Secrets
and Vault together; a mismatch safely produces HTTP 401.

**Privilege boundary:** the service-role key has project-wide privileged access.
It is not a least-privilege worker credential. This migration revokes direct writes
to these two tables and grants only the publication RPCs to `service_role`, but
that does not reduce the key's authority elsewhere in the project. Protect Edge
deployment/secret access accordingly. Anonymous and ordinary authenticated clients
cannot write the catalog or invoke either RPC.

## 3. Enable extensions, Vault, and the first sync

In **Database → Extensions**, enable `pg_cron` (Supabase Cron) and `pg_net`. If using
SQL Editor instead, run as owner:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
```

Open **Vault** in the dashboard and confirm it is available (`supabase_vault` is
the extension behind it). If unavailable, enable it through the project's extension
UI before continuing. Do not grant app roles access to `vault.decrypted_secrets`.
Use the Vault UI to create these three unique names, or update their existing values:

| Vault name | Value you enter privately |
| --- | --- |
| `timezone_project_url` | Your project HTTPS URL, without trailing slash |
| `timezone_publishable_key` | Your public `sb_publishable_` key |
| `timezone_sync_secret` | Exactly the `TIMEZONE_SYNC_SECRET` from Edge Secrets |

Vault and Edge Secrets are separate stores; adding a value to one does not populate
the other. The Cron command references Vault names, never literal credentials.

**First sync:** manually run this SQL after deployment. This makes an external HTTP
request from your database; it is not a read-only precheck.

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'timezone_project_url')
    || '/functions/v1/timezone-sync',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'timezone_publishable_key'),
    'x-timezone-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'timezone_sync_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
```

The returned ID means **queued**, not synced. In a subsequent SQL Editor query,
inspect the response for that ID and verify persisted success:

```sql
select id, status_code, timed_out from net._http_response
where id = <returned-request-id>;

select catalog->>'version' as version, catalog->>'source' as source,
       jsonb_array_length(catalog->'zones') as places, fetched_at, checked_at
from public.timezone_catalog;

select last_attempt_at, last_success_at, last_error,
       attempt_token is not null as attempt_in_progress
from public.timezone_sync_status;
```

Expect HTTP 200, an actual IANA version, and non-null success/check timestamps.
There is intentionally no secret or upstream response body in the status row.
HTTP responses in `pg_net` are temporary; the one-row status is the durable summary.
SQL Editor owner access bypasses RLS; separately verify the roles below.

## 4. Activate the daily schedule

After a successful first sync, execute
[`supabase/manual/timezone-cron.sql`](../supabase/manual/timezone-cron.sql).
It replaces only the `timezone-iana-daily` job, so reruns do not create duplicates.
It runs at **03:15 UTC daily** on Supabase's default UTC Cron configuration. If your
project changed the Cron timezone, restore/confirm UTC or adjust the schedule.

```sql
-- Read-only schedule check (does not print credentials):
select jobid, jobname, schedule, active from cron.job
where jobname = 'timezone-iana-daily';

-- Manual kill switch: keep the last-good snapshot and stop future invocations.
select cron.unschedule(jobid) from cron.job where jobname = 'timezone-iana-daily';
```

Monitor `last_success_at`; alert operationally if it is older than 48 hours. No
external alert delivery is implemented. A stale in-progress token after a crash
expires after two minutes; a subsequent invocation can recover without deleting
data. Do not infer HTTP success from Cron's SQL job success alone.

## Data, safety, and freshness contract

| Concern | Behavior |
| --- | --- |
| Upstream | One HTTPS `https://data.iana.org/time-zones/tzdata-latest.tar.gz` archive; redirects rejected. Its own `version`, `zone.tab`, `iso3166.tab`, and `backward` stay version-coherent. No HTML scraping, TimeZoneDB, or mirror. |
| Parsing | Native streaming gzip plus a read-only ustar parser; no new dependency or filesystem extraction. 25-second upstream/decompression deadline, 2 MB compressed, 8 MB expanded, 1 MB/file, 100 members. Checks tar checksum, regular-file type, names, required members and UTF-8; unsupported archive layouts fail closed. |
| Catalog | At least 350 places, at most 1,000, at least 200 country definitions in upstream, at most 256 KB JSON. SQL also checks exact keys, types, unique names, safe labels, nonempty count and timestamps. |
| Place coverage | `zone.tab` is IANA's deprecated compatibility table, deliberately used for this existing per-country city board. `zone1970.tab` alone consolidates places away. Old names survive only through official metadata or proven `backward` links; no arbitrary alias expansion. Existing verified country labels are retained. |
| Publication | DB-clock two-minute lease; only its current token may finish. Validation, version ordering, prior coverage and publication are atomic. An expired/replaced attempt cannot overwrite newer data or success metadata. Same-version changed JSON is rejected; unchanged versions update `checked_at`/`last_success_at` without replacing JSON or `fetched_at`. |
| Failure | Parse, coverage, version or fetch failure retains the last-good snapshot. Codes are bounded and sanitized. A database outage may prevent attempt/error recording too; absence of a new error is not proof of health. |
| App reads | `/road-to` is dynamic. Server-only anonymous REST read, no-store, four-second deadline, bounded body, whole-snapshot and baseline coverage validation. Missing config/table/row, denied/network/corrupt responses fall back to `data/timezones.json`; none proves a table is absent. |
| Open board | `router.refresh()` every five minutes while visible and when returning to the tab; no full-page reload. Existing client state, null hydration values and 30-second clock are unchanged. Hidden tabs skip refresh; offline tabs cannot receive new data until connectivity returns. |
| Last-good age | A valid older snapshot stays usable during upstream outages; it is not silently labeled fresh. There is no indefinite application fetch cache. Admin SQL diagnostics distinguish real daily checks from the original fetch. |

### Explicit baseline correction

The official 2026d archive check identified exactly one preexisting country mismatch:
`Africa/El_Aaiun` was `MA`/Morocco in the bundled file; IANA `zone.tab` assigns `EH`,
and `iso3166.tab` calls it Western Sahara. This change corrects **that one record**
in `data/timezones.json`; the existing `eh.svg` flag is present. All 408 bundled names
then passed coverage, producing 418 places from that archive. This follows IANA's
catalog convention, not a position on territorial claims. Other future country
remaps remain blocked for explicit review. The original bundled dataset's overall
origin/license remains unverified; this does not retroactively establish provenance
for all its records. `public/data/timezones.json` is an unused duplicate, not updated.

**Catalog updates do not update timezone rules in Node/ICU or browsers.** The relay
still calculates January 1, 2027 arrivals using runtime `Intl`, never stored current
offsets. Keep the hosting runtime/ICU and browsers updated separately. Unsupported
new IANA names are skipped rather than assigned fabricated offsets; supported names
use the existing final-name-segment city label and country flag path. A newly added
country may need a new SVG asset; its country text remains available as image alt.

## Verification before relying on automation

Run these checks yourself in an isolated authorized backend environment; local
mocked tests do **not** prove deployed SQL, Cron, gateway auth, or Edge runtime behavior:

| Check | Expected |
| --- | --- |
| Anonymous catalog SELECT | Only the validated one-row catalog; no sync diagnostics |
| Ordinary authenticated diagnostics SELECT | No rows without `stream_admins` membership |
| Existing admin diagnostics SELECT | Operational timestamps/error code readable |
| Anonymous/authenticated catalog/status write or RPC invocation | Permission denied |
| HTTP without/wrong sync secret, including a valid ordinary user JWT | 401, no new attempt |
| Two overlapping invocations | One owns lease; other gets 409 |
| Old token finishes after lease replacement | `stale_attempt`, no data/status regression |
| Invalid JSON, coverage loss, older version | Prior catalog/fetched/check/success preserved; bounded error recorded |
| Same version, same catalog | Only check/success times advance |
| Same version, changed catalog | `same_version_changed`, old catalog retained |
| Reload `/road-to`, then leave open for five minutes | Persisted catalog used; state/scroll retained during refresh |

Local commands from repository root:

```sh
pnpm test:streams
pnpm test:timezones
pnpm lint
pnpm exec next typegen && pnpm exec tsc --noEmit
git diff --check
# Only if Deno 2 is already available; no Supabase connection is involved:
deno check --config supabase/functions/deno.json supabase/functions/timezone-sync/index.ts
```

`test:timezones` runs offline Node/tsx tests of the real parser, bounded gzip/tar
pipeline, handler dependency seam, loader fallbacks and fractional New Year arrivals.
Fixtures are synthetic. The Deno entrypoint is narrowly excluded from Next TypeScript;
shared pure modules are still checked. Next typechecking does not validate that
entrypoint or prove Supabase can bundle/deploy it. Deploy from this full checkout:
the worker's baseline JSON import refers to the existing root `data/timezones.json`.

### Local rollback / review boundaries

No staging or commits are made. Review as: (1) IANA/parser + SQL publication + tests,
(2) loader + relay refresh + tests, (3) manual operational setup. To remove local
automation, remove the new function/migration/manual SQL/tests/docs and restore the
relay loader/refresh integration; retain unrelated stream features. Do not reverse an
applied database migration without a backup and separate authorization. The manual
Cron kill switch above is the safe deployed pause; the board keeps its last-good data.

## Sources

- [IANA download format, release versioning and runtime distribution](https://data.iana.org/time-zones/tz-link.html#download)
- [IANA zone.tab](https://data.iana.org/time-zones/tzdb/zone.tab), [iso3166.tab](https://data.iana.org/time-zones/tzdb/iso3166.tab), [backward](https://data.iana.org/time-zones/tzdb/backward) — format research only; worker reads all from one archive
- [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase function authentication](https://supabase.com/docs/guides/functions/auth-headers)
- [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Vault](https://supabase.com/docs/guides/database/vault)
- Installed Next.js 16.3.2 `fetch` and `use-router` API guides under `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/`

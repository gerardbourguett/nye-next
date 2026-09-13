begin;

-- Prerequisite: 202609130001_stream_schedule.sql (admin diagnostics policy).
create function public.valid_timezone_catalog(catalog jsonb)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare item jsonb; names text[] := array[]::text[];
begin
  if jsonb_typeof(catalog) <> 'object' or octet_length(catalog::text) > 256000 then return false; end if;
  if not (catalog ?& array['version','source','zones'])
    or (select count(*) from jsonb_object_keys(catalog)) <> 3
    or jsonb_typeof(catalog->'version') <> 'string'
    or catalog->>'version' !~ '^20[0-9]{2}z{0,7}[a-z]$'
    or catalog->>'source' <> 'https://data.iana.org/time-zones/tzdata-latest.tar.gz'
    or jsonb_typeof(catalog->'zones') <> 'array' then return false; end if;
  if jsonb_array_length(catalog->'zones') not between 350 and 1000 then return false; end if;
  for item in select value from jsonb_array_elements(catalog->'zones') loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if not (item ?& array['zoneName','countryCode','countryName'])
      or (select count(*) from jsonb_object_keys(item)) <> 3
      or jsonb_typeof(item->'zoneName') <> 'string'
      or jsonb_typeof(item->'countryCode') <> 'string'
      or jsonb_typeof(item->'countryName') <> 'string'
      or length(item->>'zoneName') not between 1 and 100
      or item->>'zoneName' !~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)*$'
      or item->>'countryCode' !~ '^[A-Z]{2}$'
      or length(item->>'countryName') not between 1 and 100
      or btrim(item->>'countryName') <> item->>'countryName'
      or item->>'countryName' ~ '[[:cntrl:]]|^[[:space:]]|[[:space:]]$'
      or item->>'zoneName' = any(names) then return false; end if;
    names := array_append(names, item->>'zoneName');
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_timezone_catalog(jsonb) from public, anon, authenticated;

create table public.timezone_catalog (
  id boolean primary key default true check (id),
  catalog jsonb not null check (public.valid_timezone_catalog(catalog)),
  fetched_at timestamptz not null check (isfinite(fetched_at) and fetched_at >= '2020-01-01'::timestamptz),
  checked_at timestamptz not null check (isfinite(checked_at) and checked_at >= fetched_at)
);
create table public.timezone_sync_status (
  id boolean primary key default true check (id),
  attempt_token uuid,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check (last_error in (
    'upstream_unavailable','size_limit','archive_invalid','archive_missing_files',
    'version_invalid','catalog_invalid','alias_invalid','coverage_loss',
    'version_regression','same_version_changed','sync_failed'
  )),
  check ((attempt_token is null) or last_attempt_at is not null),
  check (last_attempt_at is null or (isfinite(last_attempt_at) and last_attempt_at >= '2020-01-01'::timestamptz)),
  check (last_success_at is null or (isfinite(last_success_at) and last_success_at >= '2020-01-01'::timestamptz))
);
insert into public.timezone_sync_status (id) values (true);
alter table public.timezone_catalog enable row level security;
alter table public.timezone_sync_status enable row level security;
revoke all on public.timezone_catalog, public.timezone_sync_status from public, anon, authenticated, service_role;
grant select on public.timezone_catalog to anon, authenticated, service_role;
grant select on public.timezone_sync_status to authenticated;
create policy "Public validated timezone catalog" on public.timezone_catalog
  for select to anon, authenticated using (true);
create policy "Admins read timezone diagnostics" on public.timezone_sync_status
  for select to authenticated using (
    exists (select 1 from public.stream_admins where user_id = (select auth.uid()))
  );

-- A DB-clock lease prevents overlapping fetches. Replaced/expired tokens cannot finish.
create function public.begin_timezone_sync() returns uuid
language plpgsql security definer set search_path = '' as $$
declare state public.timezone_sync_status; token uuid := gen_random_uuid();
begin
  select * into strict state from public.timezone_sync_status where id for update;
  if state.attempt_token is not null and state.last_attempt_at > clock_timestamp() - interval '2 minutes' then
    return null;
  end if;
  update public.timezone_sync_status set attempt_token = token,
    last_attempt_at = clock_timestamp(), last_error = null where id;
  return token;
end;
$$;

create function public.finish_timezone_sync(p_token uuid, p_catalog jsonb, p_error text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  state public.timezone_sync_status;
  old public.timezone_catalog;
  checked timestamptz;
  failure text := p_error;
  new_version text;
  old_version text;
begin
  select * into strict state from public.timezone_sync_status where id for update;
  checked := clock_timestamp();
  if p_token is null or state.attempt_token is distinct from p_token
    or state.last_attempt_at < checked - interval '2 minutes' then return 'stale_attempt'; end if;
  select * into old from public.timezone_catalog where id;
  if failure is null then
    if p_catalog is null or not public.valid_timezone_catalog(p_catalog) then
      failure := 'catalog_invalid';
    else
      new_version := p_catalog->>'version';
      old_version := old.catalog->>'version';
      -- IANA order: a..z, za..zz, zza..zzz. Do not compare version text alone.
      if old_version is not null and
        (left(new_version,4)::int, length(new_version), new_version collate "C") <
        (left(old_version,4)::int, length(old_version), old_version collate "C") then
        failure := 'version_regression';
      elsif old_version = new_version and old.catalog <> p_catalog then
        failure := 'same_version_changed';
      elsif old.catalog is not null and exists (
        select 1 from jsonb_array_elements(old.catalog->'zones') prior
        where not exists (select 1 from jsonb_array_elements(p_catalog->'zones') next
          where next->>'zoneName' = prior->>'zoneName' and next->>'countryCode' = prior->>'countryCode')
      ) then failure := 'coverage_loss';
      end if;
    end if;
  end if;
  if failure is not null then
    update public.timezone_sync_status set attempt_token = null, last_error = failure where id;
    return failure;
  end if;
  if old_version = new_version then
    -- Real successful daily check, without replacing the unchanged JSON or fetched_at.
    update public.timezone_catalog set checked_at = checked where id;
  else
    insert into public.timezone_catalog (id, catalog, fetched_at, checked_at)
      values (true, p_catalog, checked, checked)
      on conflict (id) do update set catalog = excluded.catalog,
        fetched_at = excluded.fetched_at, checked_at = excluded.checked_at;
  end if;
  update public.timezone_sync_status set attempt_token = null,
    last_success_at = checked, last_error = null where id;
  return 'ok';
end;
$$;
revoke all on function public.begin_timezone_sync() from public, anon, authenticated;
revoke all on function public.finish_timezone_sync(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.begin_timezone_sync() to service_role;
grant execute on function public.finish_timezone_sync(uuid,jsonb,text) to service_role;

commit;

begin;

-- Membership is bootstrapped out of band. No application role can grant it.
create table public.stream_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.stream_admins enable row level security;
revoke all on public.stream_admins from public, anon, authenticated;
grant select on public.stream_admins to authenticated;
create policy "Members may check their own membership" on public.stream_admins
  for select to authenticated using (user_id = (select auth.uid()));

create function public.valid_stream_options(options jsonb)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare
  item jsonb;
  identity text;
  identities text[] := array[]::text[];
begin
  if jsonb_typeof(options) <> 'array' then return false; end if;
  if jsonb_array_length(options) not between 1 and 4 then return false; end if;
  for item in select value from jsonb_array_elements(options) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if not (item ?& array['provider', 'id', 'label'])
      or (select count(*) from jsonb_object_keys(item)) <> 3
      or jsonb_typeof(item->'provider') <> 'string'
      or jsonb_typeof(item->'id') <> 'string'
      or jsonb_typeof(item->'label') <> 'string' then return false; end if;
    if length(item->>'label') not between 1 and 120
      or btrim(item->>'label') = '' or btrim(item->>'label') <> item->>'label'
      or item->>'label' ~ '^[[:space:]]|[[:space:]]$' then return false; end if;
    if not ((item->>'provider' = 'twitch' and item->>'id' ~ '^[a-z0-9_]{1,25}$')
      or (item->>'provider' = 'youtube' and item->>'id' ~ '^[A-Za-z0-9_-]{11}$')) then return false; end if;
    identity := (item->>'provider') || ':' || (item->>'id');
    if identity = any(identities) then return false; end if;
    identities := array_append(identities, identity);
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_stream_options(jsonb) from public;
grant execute on function public.valid_stream_options(jsonb) to anon, authenticated;

-- Ordered options live in the same row: one insert/update is one transaction.
-- Slots are independent of the relay's fractional UTC-offset bands.
create table public.stream_slots (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120 and btrim(title) = title and btrim(title) <> ''
    and title !~ '^[[:space:]]|[[:space:]]$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  published boolean not null default false,
  options jsonb not null check (public.valid_stream_options(options)),
  constraint one_hour_window check (ends_at = starts_at + interval '1 hour'),
  constraint supported_dates check (starts_at >= timestamptz '2000-01-01 00:00:00+00'
    and ends_at <= timestamptz '2101-01-01 00:00:00+00'),
  constraint published_slots_do_not_overlap exclude using gist
    (tstzrange(starts_at, ends_at, '[)') with &&) where (published)
);
create index stream_slots_start on public.stream_slots (starts_at);
alter table public.stream_slots enable row level security;
revoke all on public.stream_slots from public, anon, authenticated;
grant select on public.stream_slots to anon, authenticated;
grant insert, update, delete on public.stream_slots to authenticated;

create policy "Anyone may read published slots" on public.stream_slots
  for select to anon, authenticated using (published);
create policy "Admins may read private slots" on public.stream_slots
  for select to authenticated using (
    exists (select 1 from public.stream_admins where user_id = (select auth.uid()))
  );
create policy "Admins may create slots" on public.stream_slots
  for insert to authenticated with check (
    exists (select 1 from public.stream_admins where user_id = (select auth.uid()))
  );
create policy "Admins may update slots" on public.stream_slots
  for update to authenticated using (
    exists (select 1 from public.stream_admins where user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.stream_admins where user_id = (select auth.uid()))
  );
create policy "Admins may delete slots" on public.stream_slots
  for delete to authenticated using (
    exists (select 1 from public.stream_admins where user_id = (select auth.uid()))
  );

commit;

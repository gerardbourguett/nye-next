begin;

-- Widen option validation for the relay link and YouTube channel lives.
-- Every row valid under 202609130001 stays valid: `zone` is optional and the
-- new provider only adds accepted shapes. Mirrors validateOptions() in
-- lib/streams/domain.ts; the application additionally checks zones with Intl.
create or replace function public.valid_stream_options(options jsonb)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare
  item jsonb;
  identity text;
  identities text[] := array[]::text[];
  key_count int;
begin
  if jsonb_typeof(options) <> 'array' then return false; end if;
  if jsonb_array_length(options) not between 1 and 4 then return false; end if;
  for item in select value from jsonb_array_elements(options) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    select count(*) into key_count from jsonb_object_keys(item);
    if not (item ?& array['provider', 'id', 'label'])
      or key_count <> (case when item ? 'zone' then 4 else 3 end)
      or jsonb_typeof(item->'provider') <> 'string'
      or jsonb_typeof(item->'id') <> 'string'
      or jsonb_typeof(item->'label') <> 'string' then return false; end if;
    if length(item->>'label') not between 1 and 120
      or btrim(item->>'label') = '' or btrim(item->>'label') <> item->>'label'
      or item->>'label' ~ '^[[:space:]]|[[:space:]]$' then return false; end if;
    if not ((item->>'provider' = 'twitch' and item->>'id' ~ '^[a-z0-9_]{1,25}$')
      or (item->>'provider' = 'youtube' and item->>'id' ~ '^[A-Za-z0-9_-]{11}$')
      or (item->>'provider' = 'youtube_channel' and item->>'id' ~ '^UC[A-Za-z0-9_-]{22}$')) then return false; end if;
    if item ? 'zone' and (jsonb_typeof(item->'zone') <> 'string'
      or length(item->>'zone') > 64
      or item->>'zone' !~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){1,2}$') then return false; end if;
    identity := (item->>'provider') || ':' || (item->>'id');
    if identity = any(identities) then return false; end if;
    identities := array_append(identities, identity);
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_stream_options(jsonb) from public;
grant execute on function public.valid_stream_options(jsonb) to anon, authenticated;

commit;

begin;

-- Direct stream sources: `hls` (.m3u8), `dash` (.mpd) and `link` (any page),
-- whose id is an HTTPS URL. Every existing row stays valid; the new providers
-- only add accepted shapes. Mirrors normalizeStreamUrl() in
-- lib/streams/domain.ts: HTTPS, at most 400 characters, no spaces, commas,
-- quotes, angle brackets, backslashes, backticks or fragments, a dotted public
-- host name (no IP literal, no internal suffix) with an optional port, and the
-- matching extension. The application is stricter about ports and parses the
-- URL; this is the backstop for writes that bypass it.
create or replace function public.valid_stream_url(provider text, id text)
returns boolean language sql immutable strict set search_path = '' as $$
  select length(id) <= 400
    and id ~ '^https://[^[:space:],"''<>\\`#]+$'
    and id ~* '^https://[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]{4,5})?(/|\?|$)'
    and id !~* '^https://[0-9.]+(:|/|\?|$)'
    and id !~* '^https://([a-z0-9-]+\.)*(localhost|local|localdomain|internal|lan|intranet|corp|private)(:|/|\?|$)'
    and id !~* '^https://([a-z0-9-]+\.)*home\.arpa(:|/|\?|$)'
    and (provider <> 'hls' or id ~* '^[^?]*\.m3u8(\?.*)?$')
    and (provider <> 'dash' or id ~* '^[^?]*\.mpd(\?.*)?$');
$$;
revoke all on function public.valid_stream_url(text, text) from public;
grant execute on function public.valid_stream_url(text, text) to anon, authenticated;

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
      or (item->>'provider' = 'youtube_channel' and item->>'id' ~ '^UC[A-Za-z0-9_-]{22}$')
      or (item->>'provider' in ('hls', 'dash', 'link') and public.valid_stream_url(item->>'provider', item->>'id'))) then
      return false;
    end if;
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

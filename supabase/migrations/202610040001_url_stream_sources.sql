begin;

-- Direct stream sources: `hls` (.m3u8), `dash` (.mpd) and `link` (any page),
-- whose id is an HTTPS URL. Every existing row stays valid; the new providers
-- only add accepted shapes.
--
-- Mirrors isStreamUrl() in lib/streams/domain.ts but is STRICTER, so every row
-- it accepts is one the application can read back (a row the application
-- refuses makes the whole schedule fail to load). It asks for the form the
-- admin form stores: at most 400 characters from a conservative ASCII set; a
-- lowercase dotted host (labels of 1 to 63 characters without a hyphen at an
-- edge, at most 253 characters, no IP literal, no all-numeric last label, no
-- internal suffix such as .local); an optional port from 1024 to 65535; a path
-- of at least "/" without dot segments; and the matching extension.
-- Internationalized (xn--) host names are refused: whether a punycode label is
-- valid is the URL parser's call, which SQL cannot make, and the application
-- refuses them too so the two layers never disagree.
create or replace function public.valid_stream_url(provider text, id text)
returns boolean language sql immutable strict set search_path = '' as $$
  select length(id) <= 400
    and id ~ '^https://[][A-Za-z0-9._~:/?@!$&()*+;=%|{}^-]+$'
    and id ~ '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?(:(10(2[4-9]|[3-9][0-9])|1[1-9][0-9]{2}|[2-9][0-9]{3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?/'
    and length(substring(id from '^https://([^/:]+)')) <= 253
    and id !~ '^https://([a-z0-9-]*\.)*[a-z0-9-]{64,}[.:/]'
    and id !~ '^https://([a-z0-9-]*\.)*xn--'
    and id !~ '^https://[0-9.]+(:|/)'
    and id !~ '^https://[^/:]*\.([0-9]+|0x[0-9a-f]*)(:|/)'
    and id !~ '^https://([a-z0-9-]+\.)*(localhost|local|localdomain|internal|lan|intranet|corp|private)(:|/)'
    and id !~ '^https://([a-z0-9-]+\.)*home\.arpa(:|/)'
    and id !~* '^https://[^/]*/([^?]*/)?(\.|%2e){1,2}(/|\?|$)'
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

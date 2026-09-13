begin;

-- Apply after 002, including on fresh installations. Preserve its applied history.
do $$
begin
  if to_regprocedure('public.valid_timezone_catalog(jsonb)') is null
    or to_regclass('public.timezone_catalog') is null then
    raise exception 'Apply 202609130002_timezone_catalog.sql before this migration';
  end if;
end;
$$;

-- CREATE OR REPLACE preserves the existing function identity and privileges.
-- No catalog/status rows, publication RPCs, policies, or schedules are changed.
create or replace function public.valid_timezone_catalog(catalog jsonb)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare item jsonb; names text[] := array[]::text[];
begin
  if jsonb_typeof(catalog) <> 'object' or octet_length(catalog::text) > 256000 then return false; end if;
  if not (catalog ?& array['version','source','zones'])
    or (select count(*) from jsonb_object_keys(catalog)) <> 3
    or jsonb_typeof(catalog->'version') <> 'string'
    or catalog->>'version' !~ '^20[0-9]{2}z{0,7}[a-z]$'
    or jsonb_typeof(catalog->'source') is distinct from 'string'
    or catalog->>'source' is distinct from 'https://data.iana.org/time-zones/tzdata-latest.tar.gz'
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

commit;

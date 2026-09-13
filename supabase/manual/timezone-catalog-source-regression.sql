-- Solo prueba de regresión SQL MANUAL: ejecute como propietario tras las migraciones 002 y 003.
-- Los datos sintéticos solo existen en variables del bloque DO. No se leen ni escriben tablas,
-- no se publica mediante RPC, no hay llamadas externas ni cambios en el catálogo de producción.
-- Ejecute el archivo completo. Si una aserción lo interrumpe, ejecute ROLLBACK por separado.
begin read only;

do $$
declare
  fixture jsonb;
  candidate jsonb;
  invalid_source jsonb;
  field_name text;
begin
  select jsonb_build_object(
    'version', '2026d',
    'source', 'https://data.iana.org/time-zones/tzdata-latest.tar.gz',
    'zones', jsonb_agg(jsonb_build_object(
      'zoneName', 'Synthetic/Place_' || n::text,
      'countryCode', 'ZZ',
      'countryName', 'Synthetic country'
    ) order by n)
  ) into fixture from generate_series(1, 350) as series(n);

  -- IS DISTINCT FROM hace que un resultado SQL NULL falle una aserción, en lugar de superarla.
  if public.valid_timezone_catalog(fixture) is distinct from true then
    raise exception 'Regression: otherwise-valid official-source fixture rejected';
  end if;
  if public.valid_timezone_catalog(fixture - 'source') is distinct from false then
    raise exception 'Regression: missing source was not rejected';
  end if;
  for invalid_source in select value from jsonb_array_elements(
    '[null, 0, true, {}, [], "", "https://example.invalid/tzdata-latest.tar.gz"]'::jsonb
  ) loop
    candidate := jsonb_set(fixture, '{source}', invalid_source);
    if public.valid_timezone_catalog(candidate) is distinct from false then
      raise exception 'Regression: invalid source was not rejected: %', invalid_source;
    end if;
  end loop;

  -- Los campos relacionados ya tienen comprobaciones de claves obligatorias y tipos explícitos en 002.
  -- Proteja esas comprobaciones frente a la misma clase de entradas ausentes o JSON-null.
  foreach field_name in array array['version', 'zones'] loop
    if public.valid_timezone_catalog(fixture - field_name) is distinct from false
      or public.valid_timezone_catalog(jsonb_set(fixture, array[field_name], 'null'::jsonb)) is distinct from false then
      raise exception 'Regression: missing/null catalog field was not rejected: %', field_name;
    end if;
  end loop;
  foreach field_name in array array['zoneName', 'countryCode', 'countryName'] loop
    candidate := jsonb_set(fixture, '{zones,0}', (fixture #> '{zones,0}') - field_name);
    if public.valid_timezone_catalog(candidate) is distinct from false
      or public.valid_timezone_catalog(jsonb_set(fixture, array['zones', '0', field_name], 'null'::jsonb)) is distinct from false then
      raise exception 'Regression: missing/null zone field was not rejected: %', field_name;
    end if;
  end loop;
  raise notice 'Timezone catalog source and related null-guard regressions passed';
end;
$$;

rollback;

# Migraciones de la base de datos

Las migraciones están en `supabase/migrations/` (la más reciente, `202610090001_slot_change_log.sql`, añade el registro de cambios del administrador; véase `operations.md`) y se aplican en orden por nombre.
Hasta ahora se ejecutaban a mano en el SQL Editor; esto describe cómo comprobarlas
en cada pull request y cómo aplicarlas desde GitHub.

## Comprobación en cada pull request

El trabajo **Migrations (Postgres 16)** de `.github/workflows/ci.yml` crea una base
vacía, aplica todas las migraciones en orden, vuelve a ejecutar la más reciente y
comprueba:

- `valid_stream_url` contra la misma tabla de casos que usa la aplicación
  (`tests/streams/url-cases.ts`): lo que la aplicación acepta o rechaza, la base
  también.
- `valid_stream_options` con opciones válidas e inválidas.
- Que las franjas duren de 5 minutos a 92 días, en minutos exactos.

Localmente, con un servidor Postgres 16 y `psql` disponibles (usuario con permiso
para crear bases y roles):

```sh
PGHOST=localhost PGUSER=postgres pnpm check:migrations
```

Crea una base temporal y la elimina al terminar; nunca toca una base existente. Esto
**no** prueba RLS, Cron ni las funciones Edge desplegadas en Supabase.

Si cambia `valid_stream_url`, `isStreamUrl` o `normalizeStreamUrl`, añada el caso a
`tests/streams/url-cases.ts`: lo comprueban `pnpm test:streams` (aplicación) y
`pnpm check:migrations` (base de datos).

## Aplicar a Supabase desde GitHub

El flujo **Apply migrations** (`.github/workflows/migrate.yml`) es manual. Sin la casilla
*apply* solo muestra qué migraciones se ejecutarían (`supabase db push --dry-run`). Con la
casilla, solo aplica si el flujo se ejecuta sobre `main`; en cualquier otra rama falla a propósito.

Configuración, una sola vez:

1. En GitHub: **Settings → Environments → New environment** llamado `production`.
   Active *Required reviewers* para que aplicar exija una segunda aprobación.
2. En ese entorno, cree el secreto `SUPABASE_ACCESS_TOKEN` (token personal de Supabase),
   el secreto `SUPABASE_DB_PASSWORD` (contraseña de la base) y la variable
   `SUPABASE_PROJECT_REF` (identificador del proyecto).
3. **Concilie el historial.** Las migraciones ya aplicadas a mano no figuran en la tabla
   `supabase_migrations.schema_migrations`, y `db push` intentaría ejecutarlas de nuevo
   (la primera fallaría sobre tablas existentes). Con el CLI de Supabase vinculado al
   proyecto, marque como aplicada cada una que ya ejecutó, por ejemplo:

   ```sh
   supabase link --project-ref <ref>
   supabase migration repair --status applied 202609130001 202609130002 202609130003 \
     202610010001 202610020001 202610030001
   supabase db push --dry-run   # debe listar solo lo que falta
   ```

   Ejecute `--dry-run` primero y confirme que la lista coincide con lo que de verdad falta.
   Si dudó de que alguna se aplicara, compare las definiciones en el SQL Editor antes de
   marcarla.
4. Con el historial conciliado, ejecute el flujo con *apply* desactivado y revise la lista;
   después, con *apply* activado.

Las funciones Edge (`supabase/functions`) y los trabajos de Cron
(`supabase/manual/`) no forman parte de este flujo.

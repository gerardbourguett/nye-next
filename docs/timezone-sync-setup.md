# Habilitar las actualizaciones diarias del catálogo de zonas horarias de IANA

**Aplique el SQL personalmente, despliegue la función protegida, pruebe una
sincronización y después habilite la tarea diaria.** Nada de lo descrito aquí ha
conectado con su proyecto Supabase, ejecutado SQL, desplegado una función ni activado
Cron. Se desconoce el estado de su base de datos remota. El recorrido funciona con
los datos de respaldo incluidos hasta que haya una instantánea validada disponible.

## 1. Confirmar los requisitos previos de la base de datos

Complete la [configuración de transmisiones](streaming-setup.md#pasos-rápidos) con
su **usuario existente de Auth**, no con una cuenta nueva. Mantenga el registro
deshabilitado. La migración de transmisiones debe preceder a la de zonas horarias
porque los diagnósticos usan la membresía de `stream_admins`.

Ejecute esta comprobación previa de solo lectura en SQL Editor:

```sql
select to_regclass('public.stream_admins') as stream_admins,
       to_regclass('public.stream_slots') as stream_slots,
       to_regclass('public.timezone_catalog') as timezone_catalog,
       to_regclass('public.timezone_sync_status') as timezone_sync_status;
```

Como propietario, aplique las migraciones en este orden y registre cada versión aplicada:

| Estado de la instalación | Orden de aplicación |
| --- | --- |
| Instalación nueva; faltan ambos objetos de zonas horarias | Complete la migración de transmisiones **001**, después la migración de zonas horarias [**002**](../supabase/migrations/202609130002_timezone_catalog.sql) y luego la corrección de validación de la fuente [**003**](../supabase/migrations/202609130003_timezone_catalog_source_validation.sql), antes de la primera sincronización o de activar Cron. |
| Ya se confirmó la aplicación de la migración de zonas horarias 002 | Aplique **solo 003**; no vuelva a ejecutar 002 ni a crear las tablas. |
| Ya se confirmó la aplicación de 003 | Ejecute las comprobaciones de regresión y auditoría siguientes; no es necesario volver a ejecutar ninguna migración. |
| Se desconocen las versiones aplicadas o solo existen algunos de los objetos esperados | Deténgase y concilie primero el historial y las definiciones de las migraciones. La mera existencia de los objetos no identifica la versión instalada del validador. |

La migración 002 se conserva sin cambios por compatibilidad con el historial de
migraciones aplicadas. **003 es obligatoria incluso en instalaciones nuevas:**
reemplaza solo el validador y conserva sus privilegios, las tablas, las políticas,
las RPC de publicación y las programaciones existentes. Rechaza una fuente JSON-null
mediante comparaciones de tipo y valor seguras frente a NULL. La comprobación de
claves obligatorias ya rechazaba las claves ausentes. Ninguna de las dos migraciones
publica un catálogo inicial ni de reemplazo.

### Comprobar la corrección sin publicar datos de prueba

Después de 003, ejecute manualmente
[`timezone-catalog-source-regression.sql`](../supabase/manual/timezone-catalog-source-regression.sql)
como propietario. Usa un catálogo **sintético** de 350 zonas, válido en los demás
aspectos, que solo se mantiene en variables SQL locales. Comprueba que la fuente
oficial exacta se acepte y que las fuentes ausentes, JSON-null, de tipo distinto
de cadena o incorrectas se rechacen; también verifica las comprobaciones relacionadas
de campos obligatorios y tipos. Las aserciones usan `IS DISTINCT FROM`, por lo que
un resultado SQL NULL no puede contarse como satisfactorio. El archivo se ejecuta
en una transacción de solo lectura y termina con `ROLLBACK`; no inserta filas ni
llama a las RPC de publicación. Si una aserción interrumpe el script antes de su
última instrucción, ejecute `ROLLBACK` por separado. Estas comprobaciones SQL **no**
se han ejecutado como parte de la corrección local; las pruebas de Node no demuestran
el comportamiento de la base de datos.

Reemplazar una función no vuelve a validar automáticamente las filas existentes
contra su restricción CHECK. Después de aplicar 003, ejecute esta auditoría
independiente de solo lectura:

```sql
select id from public.timezone_catalog
where public.valid_timezone_catalog(catalog) is not true;
```

Se espera que no devuelva filas. Si devuelve alguna, no considere validada la
instantánea almacenada ni continúe con la primera sincronización o activación;
coordine una corrección explícita revisada por el propietario. Esta corrección no
elimina, reetiqueta ni repara silenciosamente los datos existentes. Su transacción
se revierte si falla la migración; una vez aplicada, no vuelva al validador de 002,
ya que reabriría el fallo que permite una fuente nula. Aplicar únicamente esta
corrección SQL no requiere volver a desplegar Edge ni activar Cron.

## 2. Configurar y desplegar la Edge Function

1. Genere un secreto aleatorio privado con su gestor de contraseñas (al menos 32 bytes
   aleatorios codificados en hexadecimal, 64 caracteres; longitud máxima aceptada: 256).
2. En **Edge Functions → Secrets**, asigne ese valor a `TIMEZONE_SYNC_SECRET`.
   Nunca lo incluya en una variable pública, un archivo fuente, un chat ni SQL
   registrado en un commit.
3. El proceso usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, proporcionadas por la
   plataforma. Confirme que estas variables integradas estén disponibles para su
   función. Esta implementación requiere ese JWT de service-role; no trata una clave
   moderna `sb_secret_` como un JWT. No lo copie en la aplicación Next.js.
4. Desde esta copia del repositorio, con una CLI de Supabase que haya instalado por
   su cuenta y una cuenta o sesión que elija explícitamente, ejecute el siguiente
   comando de despliegue manual. Autentíquese personalmente si es necesario; ningún
   agente debe descubrir ni reutilizar una sesión.

```sh
# Manual only: replace the placeholder locally. Do not run db push.
supabase functions deploy timezone-sync --project-ref <your-project-ref> --no-verify-jwt
```

`supabase/config.toml` deshabilita la verificación JWT de la puerta de enlace
**solo para esta función**. El manejador exige `x-timezone-sync-secret` y lo verifica
antes de cualquier operación de base de datos. Una clave publicable o un JWT normal
de Auth por sí solos no pueden iniciar la sincronización. No se admite acceso CORS
ni una URL de origen proporcionada en el cuerpo. Conserve esta comprobación de la
aplicación al cambiar la configuración del despliegue. Rote el secreto en Edge Secrets
y Vault al mismo tiempo; una discrepancia produce HTTP 401 de forma segura.

**Límite de privilegios:** la clave de service-role tiene acceso privilegiado a todo
el proyecto. No es una credencial de mínimos privilegios para este proceso. Esta
migración revoca las escrituras directas en estas dos tablas y concede a `service_role`
solo las RPC de publicación, pero eso no reduce la autoridad de la clave en otras
partes del proyecto. Proteja en consecuencia el acceso al despliegue y a los secretos
de Edge. Los clientes anónimos y los autenticados normales no pueden escribir en
el catálogo ni invocar ninguna de las dos RPC.

## 3. Habilitar las extensiones, Vault y la primera sincronización

En **Database → Extensions**, habilite `pg_cron` (Supabase Cron) y `pg_net`. Si usa
SQL Editor en su lugar, ejecute como propietario:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
```

Abra **Vault** en el panel y confirme que esté disponible (`supabase_vault` es la
extensión que lo sustenta). Si no está disponible, habilítelo desde la interfaz
de extensiones del proyecto antes de continuar. No conceda a los roles de la aplicación
acceso a `vault.decrypted_secrets`. Use la interfaz de Vault para crear estos tres
nombres únicos o actualizar sus valores existentes:

| Nombre en Vault | Valor que debe introducir de forma privada |
| --- | --- |
| `timezone_project_url` | La URL HTTPS de su proyecto, sin barra final |
| `timezone_publishable_key` | Su clave pública `sb_publishable_` |
| `timezone_sync_secret` | Exactamente el `TIMEZONE_SYNC_SECRET` de Edge Secrets |

Vault y Edge Secrets son almacenes separados; añadir un valor a uno no lo añade
al otro. El comando de Cron hace referencia a nombres de Vault, nunca a credenciales
literales.

**Primera sincronización:** ejecute manualmente este SQL después del despliegue.
Esto realiza una solicitud HTTP externa desde su base de datos; no es una
comprobación previa de solo lectura.

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

El ID devuelto significa **en cola**, no sincronizado. En una consulta posterior
de SQL Editor, inspeccione la respuesta de ese ID y verifique que el éxito haya
quedado registrado de forma persistente:

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

Se espera HTTP 200, una versión real de IANA y marcas de tiempo de éxito y comprobación
no nulas. La fila de estado no contiene secretos ni el cuerpo de respuesta del origen,
de forma deliberada. Las respuestas HTTP de `pg_net` son temporales; el estado de
una sola fila es el resumen persistente. El acceso como propietario en SQL Editor
omite RLS; verifique por separado los roles indicados más abajo.

## 4. Activar la programación diaria

Después de una primera sincronización correcta, ejecute
[`supabase/manual/timezone-cron.sql`](../supabase/manual/timezone-cron.sql).
Reemplaza solo la tarea `timezone-iana-daily`, por lo que volver a ejecutarlo no crea
duplicados. Se ejecuta **todos los días a las 03:15 UTC** con la configuración UTC
predeterminada de Cron en Supabase. Si se cambió la zona horaria de Cron en su
proyecto, restaure o confirme UTC, o ajuste la programación.

```sql
-- Read-only schedule check (does not print credentials):
select jobid, jobname, schedule, active from cron.job
where jobname = 'timezone-iana-daily';

-- Manual kill switch: keep the last-good snapshot and stop future invocations.
select cron.unschedule(jobid) from cron.job where jobname = 'timezone-iana-daily';
```

Supervise `last_success_at`; genere una alerta operativa si tiene más de 48 horas
de antigüedad. No se ha implementado el envío de alertas externas. Un token de
ejecución pendiente tras una caída caduca después de dos minutos; una invocación
posterior puede recuperarse sin eliminar datos. No deduzca el éxito HTTP únicamente
del éxito de la tarea SQL de Cron.

## Contrato de datos, seguridad y vigencia

| Aspecto | Comportamiento |
| --- | --- |
| Origen | Un único archivo HTTPS `https://data.iana.org/time-zones/tzdata-latest.tar.gz`; se rechazan las redirecciones. Sus propios `version`, `zone.tab`, `iso3166.tab` y `backward` mantienen la coherencia de versión. No se extraen datos de HTML ni se usa TimeZoneDB o un servidor espejo. |
| Análisis | Descompresión gzip nativa en flujo y un analizador ustar de solo lectura; sin nuevas dependencias ni extracción al sistema de archivos. Límite de 25 segundos para origen/descompresión, 2 MB comprimidos, 8 MB descomprimidos, 1 MB/archivo, 100 entradas. Se comprueban la suma de verificación tar, el tipo de archivo regular, los nombres, las entradas obligatorias y UTF-8; las estructuras de archivo no compatibles se rechazan de forma segura. |
| Catálogo | Al menos 350 lugares, como máximo 1,000, al menos 200 definiciones de países en el origen, como máximo 256 KB de JSON. SQL también comprueba claves exactas, tipos, nombres únicos, etiquetas seguras, cantidad no vacía y marcas de tiempo. |
| Cobertura de lugares | `zone.tab` es la tabla de compatibilidad obsoleta de IANA, usada deliberadamente para este tablero existente de ciudades por país. Usar solo `zone1970.tab` agrupa lugares y elimina entradas individuales. Los nombres antiguos se conservan solo mediante metadatos oficiales o enlaces `backward` comprobados; no se amplían los alias arbitrariamente. Se conservan las etiquetas de países existentes y verificadas. |
| Publicación | Reserva de ejecución de dos minutos según el reloj de la base de datos; solo su token vigente puede finalizar. La validación, el orden de versiones, la cobertura previa y la publicación son atómicos. Un intento caducado o reemplazado no puede sobrescribir datos ni metadatos de éxito más recientes. Se rechaza un JSON modificado con la misma versión; las versiones sin cambios actualizan `checked_at`/`last_success_at` sin reemplazar el JSON ni `fetched_at`. |
| Fallo | Un fallo de análisis, cobertura, versión u obtención conserva la última instantánea válida. Los códigos están acotados y saneados. Una caída de la base de datos también puede impedir registrar el intento o error; la ausencia de un error nuevo no demuestra un funcionamiento correcto. |
| Lecturas de la aplicación | `/road-to` es dinámico. Lectura REST anónima solo desde el servidor, no-store, límite de cuatro segundos, cuerpo acotado y validación de la instantánea completa y de la cobertura base. Si faltan configuración/tabla/fila o hay respuestas denegadas, errores de red o respuestas corruptas, se recurre a `data/timezones.json`; ninguno de estos casos demuestra que falte una tabla. |
| Tablero abierto | `router.refresh()` cada cinco minutos mientras está visible y al volver a la pestaña; sin recargar toda la página. No cambian el estado existente del cliente, los valores nulos de hidratación ni el reloj de 30 segundos. Las pestañas ocultas omiten la actualización; las pestañas sin conexión no pueden recibir datos nuevos hasta que se restablezca la conectividad. |
| Antigüedad de la última instantánea válida | Una instantánea anterior válida sigue siendo utilizable durante interrupciones del origen; no se etiqueta silenciosamente como reciente. No hay una caché indefinida de obtención en la aplicación. Los diagnósticos SQL de administración distinguen las comprobaciones diarias reales de la obtención original. |

### Corrección explícita de los datos base

La comprobación del archivo oficial 2026d identificó exactamente una discrepancia
de país preexistente: `Africa/El_Aaiun` figuraba como `MA`/Morocco (Marruecos) en el archivo
incluido; `zone.tab` de IANA asigna `EH` e `iso3166.tab` lo denomina Western Sahara
(Sáhara Occidental). Este cambio corrige **ese único registro** en `data/timezones.json`;
la bandera existente `eh.svg` está presente. Después, los 408 nombres incluidos
superaron la comprobación de cobertura, con 418 lugares obtenidos de ese archivo.
Esto sigue la convención del catálogo de IANA, no expresa una posición sobre
reclamaciones territoriales. Otras reasignaciones futuras de países siguen bloqueadas
hasta una revisión explícita. El origen y la licencia generales del conjunto de datos
original incluido siguen sin verificarse; esto no establece retroactivamente la
procedencia de todos sus registros. `public/data/timezones.json` es un duplicado
sin uso y no se ha actualizado.

**Las actualizaciones del catálogo no actualizan las reglas de zonas horarias en
Node/ICU ni en los navegadores.** El recorrido sigue calculando las llegadas del
1 de enero de 2027 con `Intl` del entorno de ejecución, nunca con desfases actuales
almacenados. Mantenga actualizados por separado el entorno de ejecución/ICU del
alojamiento y los navegadores. Los nombres nuevos de IANA no compatibles se omiten
en lugar de asignarles desfases inventados; los compatibles usan la etiqueta de ciudad
existente basada en el último segmento del nombre y la ruta de la bandera del país.
Un país recién añadido puede necesitar un nuevo recurso SVG; su texto de país sigue
disponible como texto alternativo de la imagen.

## Verificación antes de depender de la automatización

Ejecute personalmente estas comprobaciones en un entorno de backend aislado y
autorizado; las pruebas locales con simulaciones **no** demuestran el comportamiento
del SQL desplegado, Cron, la autenticación de la puerta de enlace ni el entorno
de ejecución Edge:

| Comprobación | Resultado esperado |
| --- | --- |
| SELECT anónimo del catálogo | Solo el catálogo validado de una fila; sin diagnósticos de sincronización |
| SELECT de diagnósticos con autenticación normal | Sin filas si no hay membresía de `stream_admins` |
| SELECT de diagnósticos de un administrador existente | Marcas de tiempo operativas y código de error legibles |
| Escritura de catálogo/estado o invocación de RPC anónima/autenticada | Permiso denegado |
| HTTP sin secreto de sincronización o con uno incorrecto, incluso con un JWT válido de usuario normal | 401, sin intento nuevo |
| Dos invocaciones superpuestas | Una obtiene la reserva; la otra recibe 409 |
| Un token antiguo finaliza después de reemplazar la reserva | `stale_attempt`, sin regresión de datos ni estado |
| JSON no válido, pérdida de cobertura, versión anterior | Se conservan el catálogo y las marcas de obtención/comprobación/éxito anteriores; se registra un error acotado |
| Misma versión, mismo catálogo | Solo avanzan las marcas de comprobación y éxito |
| Misma versión, catálogo modificado | `same_version_changed`, se conserva el catálogo anterior |
| Recargar `/road-to` y dejarlo abierto cinco minutos | Se usa el catálogo persistido; se conservan el estado y la posición de desplazamiento durante la actualización |

Comandos locales desde la raíz del repositorio:

```sh
pnpm test:streams
pnpm test:timezones
pnpm lint
pnpm exec next typegen && pnpm exec tsc --noEmit
git diff --check
# Only if Deno 2 is already available; no Supabase connection is involved:
deno check --config supabase/functions/deno.json supabase/functions/timezone-sync/index.ts
```

`test:timezones` ejecuta pruebas sin conexión con Node/tsx del analizador real,
la cadena acotada de gzip/tar, el punto de integración de dependencias del manejador,
las alternativas del cargador y las llegadas de Año Nuevo con desfases fraccionarios.
Los datos de prueba son sintéticos. Solo el punto de entrada de Deno está excluido
de la comprobación TypeScript de Next; los módulos puros compartidos siguen
comprobándose. La comprobación de tipos de Next no valida ese punto de entrada
ni demuestra que Supabase pueda empaquetarlo o desplegarlo. Despliegue desde esta
copia completa del repositorio: la importación del JSON base del proceso hace
referencia al `data/timezones.json` existente en la raíz.

### Reversión local y límites de revisión

No se añaden cambios al área de preparación ni se crean commits. Revise por partes:
(1) IANA/analizador + publicación SQL + pruebas, (2) cargador + actualización del
recorrido + pruebas, (3) configuración operativa manual. Para retirar la automatización
local, elimine la nueva función, migración, SQL manual, pruebas y documentación,
y restaure la integración del cargador y la actualización del recorrido; conserve
las funciones de transmisiones no relacionadas. No revierta una migración de base
de datos aplicada sin una copia de seguridad y una autorización separada. El mecanismo
manual anterior para detener Cron es la forma segura de pausar el despliegue;
el tablero conserva sus últimos datos válidos.

## Fuentes

- [Formato de descarga, versiones de publicaciones y distribución a entornos de ejecución de IANA](https://data.iana.org/time-zones/tz-link.html#download)
- [zone.tab de IANA](https://data.iana.org/time-zones/tzdb/zone.tab), [iso3166.tab](https://data.iana.org/time-zones/tzdb/iso3166.tab), [backward](https://data.iana.org/time-zones/tzdb/backward) — solo investigación del formato; el proceso lee todo de un único archivo
- [Funciones programadas de Supabase](https://supabase.com/docs/guides/functions/schedule-functions)
- [Autenticación de funciones de Supabase](https://supabase.com/docs/guides/functions/auth-headers)
- [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Vault](https://supabase.com/docs/guides/database/vault)
- Guías instaladas de las API `fetch` y `use-router` de Next.js 16.3.2 en `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/`

# Habilitar la sala de visualización y el gestor privado de programación

La implementación local añade `/watch`, `/admin` y `/admin/login`. No se ha verificado
el estado de la base de datos remota. Un inicio de sesión correcto con una consulta
de permisos no disponible no demuestra que falte una tabla o una membresía. Complete
estas comprobaciones manuales antes de publicar programación real. No se incluyen
credenciales ni una programación de ejemplo.

## Pasos rápidos

1. **Seleccione su proyecto existente de Supabase y su usuario existente de Auth.**
   No se necesita ni se crea una cuenta nueva. En SQL Editor, ejecute la comprobación
   previa de objetos de solo lectura que aparece más abajo.
2. Solo si **faltan ambas tablas de transmisiones**, ejecute
   [`202609130001_stream_schedule.sql`](../supabase/migrations/202609130001_stream_schedule.sql)
   una sola vez. La migración es transaccional y está versionada; registre su aplicación.
   No vuelva a ejecutarla sobre tablas existentes ni ignore un error. Si existe alguna
   de las tablas, concilie primero el historial y las definiciones de las migraciones;
   no elimine ni vuelva a crear los datos.
   Después, ejecute una vez
   [`202610010001_stream_option_places.sql`](../supabase/migrations/202610010001_stream_option_places.sql).
   Solo reemplaza la función `valid_stream_options` para aceptar el lugar opcional
   (`zone`, zona IANA) y el proveedor `youtube_channel`; todas las filas existentes
   siguen siendo válidas. Mientras no se aplique, guardar una opción con lugar o con
   canal de YouTube falla con “Slot not saved”.
   Luego ejecute una vez
   [`202610020001_flexible_slot_duration.sql`](../supabase/migrations/202610020001_flexible_slot_duration.sql).
   Reemplaza la regla de “exactamente 1 hora” por una duración de 5 minutos a 7 días
   en minutos exactos (útil para ensayos generales). Las franjas existentes siguen
   siendo válidas. Mientras no se aplique, guardar una duración distinta de 1 hora
   falla con “Slot not saved”.
3. En **Authentication → Providers → Email**, habilite el inicio de sesión con correo
   electrónico y contraseña. En la configuración de Auth,
   **desactive “Allow new users to sign up”**. Mantenga esa opción desactivada;
   eliminar solo la interfaz de registro
   no deshabilita la API de registro de Supabase.
4. En **Authentication → Users**, localice su único usuario existente. Conserve esa
   identidad; no cree, invite ni promueva automáticamente otra cuenta. La recuperación
   de contraseñas sigue a cargo del propietario; esta aplicación no tiene callbacks
   de invitación, OAuth ni restablecimiento de contraseña.
5. Copie el UUID del usuario existente desde Authentication → Users. Como propietario
   de la base de datos en SQL Editor, otorgue la membresía con la plantilla siguiente.
   La identidad de Auth por sí sola **no** otorga permisos de administración. Nunca
   otorgue el acceso inicial mediante metadatos que el usuario pueda editar.
6. Conserve su `.env.local` existente; no lo sobrescriba. Si parte de una copia nueva
   del repositorio, use `.env.example` como plantilla e introduzca de forma privada
   la URL del proyecto y la **clave publicable** de su pantalla Connect/API Keys.
   Configure las mismas dos variables en el entorno de despliegue. Reinicie el
   servidor de desarrollo después de los cambios.
7. Ejecute `pnpm dev`, abra `/admin/login`, cree un borrador y publíquelo. Visite
   `/watch` para verificar la hora actual y las alternativas. Las franjas futuras
   aparecen en Coming up; nada se etiqueta como en directo solo por estar programado.

```sql
-- Read-only object precheck, BEFORE running any migration:
select to_regclass('public.stream_admins') as stream_admins,
       to_regclass('public.stream_slots') as stream_slots;
```

Una vez confirmados ambos objetos, distinga la ausencia de membresía de un fallo
en la consulta:

```sql
-- Owner-only read; substitute the UUID of your existing verified Auth user.
select exists (
  select 1 from public.stream_admins
  where user_id = '<verified-auth-user-uuid>'::uuid
) as is_stream_admin;

-- Replace the placeholder with the verified Auth user's UUID, then execute as owner.
insert into public.stream_admins (user_id)
values ('<verified-auth-user-uuid>'::uuid)
on conflict (user_id) do nothing;

-- To revoke schedule access, execute as owner:
delete from public.stream_admins
where user_id = '<verified-auth-user-uuid>'::uuid;
```

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL HTTPS del proyecto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública que comienza por `sb_publishable_` |

Solo se aceptan claves publicables modernas. No introduzca una clave secreta, un
JWT heredado de service-role, una contraseña de base de datos ni una credencial del
propietario en ninguna de las variables. La aplicación Next.js no depende de una
clave de servicio (el proceso Edge independiente de zonas horarias sí). Si falta
la configuración o no es válida, se muestran estados seguros de indisponibilidad
o configuración, sin interrumpir la cuenta regresiva ni el recorrido existentes.

Si los objetos y la membresía existen pero la consulta de permisos sigue fallando,
compare las políticas y concesiones RLS de este proyecto con la migración y verifique
que la configuración privada de la aplicación apunte al proyecto previsto. No otorgue
acceso mediante metadatos del usuario ni suponga que se necesita otra cuenta. Para
la automatización diaria de IANA, continúe con la [configuración de sincronización
de zonas horarias](timezone-sync-setup.md) después de estos requisitos de transmisiones.

## Reglas de programación

- Una franja es independiente de las bandas de zonas horarias del recorrido. El inicio
  es inclusivo, el final es exclusivo y la duración es exactamente una hora transcurrida.
  Se almacenan marcas de tiempo UTC.
- El editor indica la zona horaria IANA del navegador y muestra una vista previa del
  intervalo UTC. Las fechas de calendario no válidas, las horas locales inexistentes
  o repetidas por cambios de horario de verano (DST) y los cambios de zona horaria se
  rechazan en lugar de ajustarse silenciosamente. Use una hora inequívoca o cambie
  temporalmente la zona horaria del navegador o sistema a UTC para las horas de transición.
- Se almacenan entre una y cuatro opciones únicas como un arreglo JSONB ordenado en
  la misma fila. Una sola escritura SQL reemplaza de forma atómica el título, el
  intervalo, el estado de publicación y las opciones. Tanto la validación del servidor
  como las restricciones SQL verifican la cantidad y los ID.
- La primera opción es la predeterminada. Subir una opción cambia su orden. Se aceptan
  nombres o URL HTTPS de canales de Twitch, o ID de videos de YouTube y URL de watch,
  live, shorts, embed e youtu.be. Se analizan las URL y se descartan los parámetros de
  consulta. No se admiten ID de canales o listas de reproducción, VOD o clips de Twitch,
  URL arbitrarias ni HTML de iframe. Un ID sintácticamente válido no demuestra que
  exista un video.
- Los borradores permanecen privados. La restricción de exclusión GiST de PostgreSQL
  rechaza intervalos **publicados** que se intersectan, incluidos los intentos
  concurrentes; se permiten horas exactamente adyacentes. Los borradores pueden
  superponerse. Retirar una publicación y eliminar requieren confirmación.
- La sala solicita solo filas publicadas mediante un cliente anónimo del lado del
  servidor, incluso cuando el espectador ha iniciado sesión como administrador.
  Su intervalo acotado abarca las 24 horas anteriores y los 14 días siguientes;
  Coming up muestra las próximas 12 franjas. La lista de administración muestra
  las últimas 200 franjas por hora de inicio; la URL de edición de una franja conocida
  sigue cargándola de forma independiente. Los historiales más extensos requieren una
  futura ampliación con paginación.
- La sala se actualiza cada 30 segundos (con un tiempo máximo de espera de 12 segundos
  por solicitud), actualiza los límites de las franjas cada segundo usando la última
  muestra del reloj del servidor y vuelve a la primera opción si se elimina la
  selección. Solo puede existir un iframe. Una transición de franja o la eliminación
  de una opción cierra el reproductor anterior; el siguiente requiere otra acción
  Load. Tras 90 segundos sin una programación actualizada, se retira el reproductor
  en lugar de presentar como vigente una programación no verificada.
- En las actualizaciones de los editores prevalece la última escritura. Coordine
  a quienes editen simultáneamente; no se ha implementado la detección de conflictos
  entre revisiones. Si una escritura agota el tiempo de espera, recargue antes de
  reintentar: la transacción de base de datos puede haberse confirmado aunque se
  haya perdido la respuesta.

## Reproductores integrados y despliegue

**Despliegue en un servidor compatible con Next.js mediante HTTPS. No se prescribe
un alojamiento concreto.** No configure una CDN para almacenar en caché `/admin`,
sus respuestas de Server Actions ni `/watch/schedule`. Las respuestas con cookies
de Auth deben mantenerse como private/no-store. Conserve las cabeceras reenviadas
de host/origin y las comprobaciones CSRF de mismo origen predeterminadas de Next
para Server Actions; no añada comodines en `allowedOrigins`. Conserve los límites
de solicitudes de Auth de Supabase y configure protección contra abusos del inicio
de sesión en el despliegue antes del lanzamiento público.

- Twitch requiere SSL, un nombre de host `parent` y un reproductor de al menos
  400×300. La aplicación obtiene `parent` de `window.location.hostname` **después
  del montaje**, sin puerto. Los dominios de vista previa funcionan con su nombre
  de host real cuando se sirven mediante HTTPS. Esta aplicación supone que es la
  página de nivel superior, no que está anidada en un iframe ajeno.
- Con HTTP (incluido `pnpm dev` habitual) o un área de reproducción de menos de
  400px de ancho, Twitch recurre al enlace directo. Pruebe los reproductores integrados
  en un origen HTTPS legítimo de desarrollo local o un despliegue HTTPS autorizado;
  no desactive la seguridad del navegador. YouTube requiere al menos 200×200; este
  reproductor reserva 300px de alto.
- Cargar un reproductor conecta el navegador con Twitch/YouTube. No se realizan
  solicitudes al proveedor para un iframe hasta que el visitante selecciona Load.
  Ningún proveedor reproduce automáticamente; el visitante utiliza después su
  control nativo Play. Atienda los requisitos de privacidad y consentimiento y las
  condiciones de los proveedores aplicables a su audiencia antes del lanzamiento.
- Los estados sin conexión, integración deshabilitada, restricción por edad o región,
  finalización e indisponibilidad del contenido siguen siendo responsabilidad del
  proveedor. La aplicación no inspecciona el contenido de iframes de otros orígenes
  ni afirma detectar el estado de conexión. Siempre hay un enlace directo al proveedor
  para la transmisión seleccionada, y las próximas opciones también tienen enlaces directos.
- Si incorpora una política de seguridad de contenido más adelante, permita los
  orígenes de marcos requeridos por los proveedores (`https://player.twitch.tv`,
  `https://www.youtube.com`) y verifique la política completa en un navegador.
  No elimine el referente HTTPS normal de las solicitudes a YouTube; el iframe usa
  `strict-origin-when-cross-origin`.

## Seguridad y validación de la base de datos antes del lanzamiento

Las Server Actions verifican la identidad con `auth.getUser()` y después consultan
la membresía protegida en **cada** mutación. Las lecturas privadas usan la misma
comprobación. `proxy.ts` renueva las cookies solo para `/admin` y propaga las cookies
de solicitud y respuesta y las cabeceras no-store; la navegación mediante el proxy
no es el límite de autorización. No existe una API de registro, autopromoción,
redirección arbitraria ni mutación sin autenticación.

La migración concede solo SELECT a los usuarios anónimos y escrituras sujetas a RLS
a los usuarios autenticados, y no permite escrituras de membresía a ningún rol de
aplicación. La única política SELECT de membresía expone solo la del usuario actual.
Pruebe RLS con los roles reales `anon`/`authenticated` o sus clientes de API pública,
**no** solo como propietario desde el panel, ya que este omite RLS. En un proyecto
de pruebas aislado:

| Comprobación | Resultado esperado |
| --- | --- |
| SELECT anónimo | Solo filas publicadas; sin borradores ni membresías |
| INSERT/UPDATE/DELETE anónimo | Permiso denegado |
| SELECT autenticado sin administración | Solo filas publicadas; sin borradores |
| Escritura autenticada sin administración | Ninguna fila modificada / infracción de RLS |
| INSERT/UPDATE/DELETE de membresía con o sin administración | Permiso denegado; autopromoción imposible |
| SELECT/escritura de un administrador confirmado | Los borradores se pueden leer; crear, editar y eliminar franjas válidas funciona correctamente |
| El propietario retira la membresía y la misma sesión reintenta | Lectura y escritura privadas denegadas de inmediato por la política |
| 0 o 5 opciones, proveedor/ID no válido, fuente duplicada, etiqueta vacía | Infracción de restricción de comprobación; reversión de toda la escritura |
| Duración incorrecta o fechas fuera de rango | Infracción de restricción de comprobación |
| Dos franjas publicadas superpuestas | Infracción de exclusión (`23P01`) |
| Franjas publicadas adyacentes / borradores superpuestos | Permitidos |
| Publicación concurrente superpuesta en dos transacciones | Una espera y luego falla si la otra se confirma |
| Edición de opciones e intervalo con datos no válidos | La fila anterior permanece completamente intacta |

Para probar un rol en la transacción de prueba de SQL Editor, use `begin;`,
`set local role authenticated;` y después
`select set_config('request.jwt.claim.sub', '<test-user-uuid>', true);` antes de
las consultas. Use transacciones separadas para los fallos esperados y termine con
`rollback;`. Para comprobaciones anónimas, use `set local role anon;`. Primero cree
usuarios reales de prueba en Auth y filas como propietario. No deje programación
ficticia de prueba publicada en el proyecto de producción. Verifique el comportamiento
de la API pública además de los roles SQL.

## Verificación local y comprobaciones pendientes

```sh
pnpm test:streams
pnpm lint
pnpm exec next typegen && pnpm exec tsc --noEmit
git diff --check
```

`test:streams` usa el ejecutor de pruebas de Node mediante `tsx`. Las pruebas ejecutan
el análisis de URL, las restricciones de opciones, los intervalos UTC y la lógica
de superposición, la validación de DST, la selección alternativa y el punto de
integración del adaptador de autorización. **No** demuestran el funcionamiento de
RLS desplegado, las sesiones reales o la renovación de cookies, el transporte CSRF
ni la reproducción de los proveedores. Estas comprobaciones no requieren una
compilación de producción ni instalar herramientas de navegador.

Antes del lanzamiento, ejecute la matriz de políticas anterior y una tanda de pruebas
en navegadores de escritorio y móviles que cubra ambos temas, navegación por teclado,
alternativa para pantallas estrechas, configuración ausente, fallo/éxito/revocación
del inicio de sesión, mensajes de creación/edición/eliminación, límites de franjas,
selecciones eliminadas, recuperación tras perder la red y ausencia de reproducción
automática. La implementación local no incluyó verificaciones en navegador ni en
un proyecto Supabase real.

### Unidades de trabajo local para revisión

Esta implementación no crea commits ni añade cambios al área de preparación.
Límites sugeridos:

1. **Contrato de programación y seguridad:** módulos y pruebas de dominio, tiempo
   y autorización, utilidades de Supabase, proxy, migración, dependencias y esta guía
   de configuración. La reversión elimina solo el nuevo backend de programación;
   no revierta una migración desplegada sin una copia de seguridad de los datos
   y una autorización separada.
2. **Sala pública:** `app/watch`, los componentes compartidos de `components/streams`,
   las notas de diseño de la sala y el enlace mínimo de navegación del recorrido.
   La reversión restaura ese enlace y elimina la sala sin cambiar la lógica de
   cuenta regresiva ni de zonas horarias.
3. **Gestión privada:** `app/admin` y sus notas de diseño. La reversión elimina
   el panel sin otorgar a nadie permisos adicionales en la base de datos.

Estos son límites de revisión, no versiones desplegadas independientes. La
configuración y autorización de los entornos de prueba del backend en ejecución
y del navegador están pendientes; las comprobaciones unitarias no los sustituyen.

## Documentación de referencia

- [Auth del lado del servidor con Supabase y Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Requisitos de integración de Twitch](https://dev.twitch.tv/docs/embed/)
- [Parámetros de iframe de Twitch](https://dev.twitch.tv/docs/embed/video-and-clips/)
- [Parámetros del reproductor de YouTube](https://developers.google.com/youtube/player_parameters)
- Guías instaladas de Next.js 16.3.2: `node_modules/next/dist/docs/01-app/` (Proxy,
  Server Actions y mutaciones, y cookies asíncronas).

## Streams por cruce del relay

- Cada opción puede indicar el **lugar que celebra** (zona IANA, por ejemplo
  `Australia/Sydney`). El relay agrupa las opciones publicadas por el desfase que
  ese lugar tiene en su medianoche de Año Nuevo y las muestra en ese cruce, con un
  enlace a `/watch?slot=…&stream=…`.
- Solo se consideran franjas publicadas que se superponen con el período entre el
  30 de diciembre a las 12:00 UTC y el 2 de enero a las 00:00 UTC de la edición actual
  (`editionStreamWindow()` en `lib/streams/relay-link.ts`).
- El enlace profundo selecciona el stream cuando empieza su hora; el reproductor
  sigue cargándose solo con un clic.
- **YouTube channel (live)** reproduce lo que el canal tenga en vivo
  (`embed/live_stream?channel=UC…`). Sirve cuando el ID del video se conoce recién
  el mismo día. Si el canal no está en vivo, el mensaje lo muestra YouTube.
- “Reuse a saved stream” lista las opciones distintas de las últimas 200 franjas;
  no existe una tabla de canales aparte.

## Estado en vivo, espectadores y chat (opcional)

`/watch` muestra si cada stream está en vivo, su título, espectadores, tiempo al
aire, miniatura y avatar solo cuando el proveedor lo confirma. Sin estas variables
todo funciona igual y los streams aparecen como “Scheduled”. Son **solo de servidor**:
no use el prefijo `NEXT_PUBLIC_`. Configúrelas en `.env.local` y en Vercel
(Settings → Environment Variables) y vuelva a desplegar.

1. **Twitch** (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`): en
   <https://dev.twitch.tv/console/apps> registre una aplicación (categoría
   “Website Integration”, OAuth Redirect URL `http://localhost`), copie el
   Client ID y genere un Client Secret. Se usa el flujo *client credentials*:
   no requiere iniciar sesión ni permisos de usuario.
2. **YouTube** (`YOUTUBE_API_KEY`): en Google Cloud Console cree un proyecto,
   habilite “YouTube Data API v3” y cree una clave de API. Restrínjala a esa API.
   Cada consulta de videos cuesta 1 unidad de la cuota diaria de 10.000; los
   resultados se guardan 60 s por instancia y 30 s en la CDN.
3. Los canales de YouTube (`youtube_channel`) se detectan por su feed público de
   subidas: si el directo no aparece entre los 15 videos más recientes del feed,
   se mostrará como “Offline”.

El chat principal siempre es el de `vanderfondi` en Twitch. Si el stream elegido
es de Twitch o un video de YouTube en vivo, su chat aparece como segunda pestaña.
El chat embebido de Twitch, igual que su reproductor, exige HTTPS.

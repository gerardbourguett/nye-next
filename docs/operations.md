# Operación: monitoreo, sincronización diaria y registro de cambios

## Rendimiento y carga el 31 de diciembre

- `/watch/schedule`, que cada espectador consulta cada 30 segundos, se comparte en la CDN
  durante 5 segundos (más 10 de revalidación en segundo plano): miles de espectadores
  provocan unas pocas lecturas de la base de datos por minuto. Los enlaces profundos
  (`?slot=`) y las vistas previas (`?at=`) nunca se comparten. La sala corrige el reloj con
  la cabecera `Age`, de modo que una respuesta compartida no atrasa el horario.
- `/road-to` comparte 30 segundos, dentro de cada instancia del servidor, la lectura del
  catálogo de zonas y la de la programación de la edición. Tras publicar una franja, sus
  enlaces en el relevo pueden tardar hasta 30 segundos más en aparecer.
- El mapa y las banderas se guardan en caché un día (y se sirven hasta una semana mientras
  se actualizan): si regenera el mapa (`scripts/generate-map-data.ts`), los visitantes
  pueden ver el anterior hasta un día.
- `e2e/performance.spec.ts` limita el JavaScript inicial de cada página a 700 KB (hoy
  ~520–550 KB). hls.js y dash.js (1,4 MB) solo se cargan al pulsar “Load player”.

## Monitoreo

- **`/health`** responde en JSON si la programación se puede leer y cuándo se comprobó
  por última vez el catálogo de zonas horarias. `200` con `status: "ok"` o `"degraded"`
  (algo requiere atención, pero el sitio funciona); `503` con `"down"` solo cuando la
  programación no se puede leer, es decir, cuando la sala de visualización está rota.
  No incluye secretos ni contenido de la programación, por lo que puede quedar público.
  Un catálogo con más de 48 horas sin comprobación figura como `stale`.
- **Errores del servidor:** `instrumentation.ts` escribe una línea JSON por error
  (`"event":"request_error"`, con ruta, tipo y `digest`) en los registros de Vercel
  (**Logs**, busque `request_error`). No incluye parámetros de la URL ni cuerpos.
- **Aviso automático:** el flujo `.github/workflows/monitor.yml` revisa cada 30
  minutos `/`, `/road-to`, `/watch` y `/health`. Un fallo (página caída, programación
  ilegible o catálogo atrasado) marca la ejecución en rojo y GitHub envía un correo.
  Para activarlo, cree la variable de repositorio `SITE_URL`
  (**Settings → Secrets and variables → Actions → Variables**), por ejemplo
  `https://su-sitio.example`. Los flujos programados pueden retrasarse varios minutos y
  GitHub los desactiva tras 60 días sin actividad en el repositorio: vuelva a activarlos
  en la pestaña **Actions** si ocurre. Para un aviso más rápido, apunte además un
  servicio externo de disponibilidad (UptimeRobot, Better Stack…) a `/health`.
- **Comprobación manual:** `pnpm check:deployment https://su-sitio` (véase
  `docs/verification.md`) también lee `/health`.

## Sincronización diaria de zonas horarias (IANA) con GitHub Actions

Alternativa a Supabase Cron, Vault y `pg_net` (`docs/timezone-sync-setup.md`, sección 4):
el flujo `.github/workflows/timezone-sync.yml` llama todos los días a las 03:15 UTC a la
función protegida `timezone-sync`. Requiere que la función ya esté desplegada y que haya
hecho una primera sincronización correcta (secciones 1 a 3 de esa guía). Use **una** de las
dos opciones, no ambas.

En **Settings → Secrets and variables → Actions**:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| Variable | `SUPABASE_URL` | La URL HTTPS del proyecto, sin barra final |
| Secreto | `SUPABASE_PUBLISHABLE_KEY` | La clave pública `sb_publishable_…` |
| Secreto | `TIMEZONE_SYNC_SECRET` | Exactamente el mismo valor que en Edge Secrets |

Sin `SUPABASE_URL` el flujo se omite. Si la función no responde `200`, la ejecución falla
y GitHub avisa; el último catálogo válido sigue en uso. Puede ejecutarlo a mano desde la
pestaña **Actions → IANA timezone sync → Run workflow**. Si el flujo falla durante dos
días, `/health` pasa a `stale` y el monitor también avisa.

## Registro de cambios de la programación

La base de datos registra cada alta, edición y borrado de una franja en
`stream_slot_changes` (migración `202610090001_slot_change_log.sql`; véase
`docs/migrations.md` para aplicarla). Un trigger lo hace, de modo que ni la aplicación ni
otra herramienta pueden omitirlo. El registro es de solo anexado: ningún rol de la
aplicación puede escribirlo, modificarlo ni borrarlo, y solo los administradores lo leen.
`/admin` muestra los últimos 50 cambios (quién, cuándo y qué cambió). Los cambios hechos
desde el SQL Editor o con la clave de servicio aparecen como “Database or service”.
No hay borrado automático; son filas pequeñas, pero revíselas si la programación crece
mucho.

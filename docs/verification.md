# Verificación con servicios reales

Las pruebas automáticas usan un Supabase simulado y nunca llaman a Twitch ni a YouTube.
Lo siguiente solo se puede comprobar con el despliegue real. Todo es de solo lectura,
salvo lo que se indica.

## 1. Credenciales de los proveedores

En Vercel (**Settings → Environment Variables**, entorno Production) defina:

| Variable | Para qué |
| --- | --- |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Estado “Live” y espectadores de Twitch |
| `YOUTUBE_API_KEY` | Estado “Live” de videos y canales de YouTube |

Las fuentes HLS y DASH no necesitan ninguna. Vuelva a desplegar para que las variables
lleguen al servidor y ejecute:

```sh
pnpm check:deployment https://su-sitio --require-providers
```

Comprueba que las páginas (y sus vistas previas `?at=&speed=`) respondan, que la
programación se lea de la base real, que las credenciales hayan llegado al servidor y
qué informa cada transmisión programada: `LIVE`, `offline` o `unconfirmed`.
`unconfirmed` es lo correcto cuando el proveedor no pudo confirmar nada; nunca debe
aparecer `LIVE` sin que la transmisión esté en el aire.

## 2. Una transmisión en vivo de verdad

Con una franja publicada que incluya cada tipo de fuente que pretenda usar:

1. Ponga al aire un canal de Twitch y, si lo usará, un video o canal de YouTube.
2. Repita `pnpm check:deployment …`: esas claves deben pasar a `LIVE` (en Vercel, la
   respuesta puede tardar hasta 30 s por la caché del CDN).
3. Detenga la transmisión y compruebe que vuelve a `offline` en un par de minutos.
4. Para HLS/DASH: apunte una opción a un `.m3u8` o `.mpd` en vivo con HTTPS público.
   Debe pasar a `LIVE`; un video grabado (con `#EXT-X-ENDLIST`) o un error del servidor
   se queda en `unconfirmed`, nunca en `LIVE`.

## 3. El administrador, con sesión iniciada

Inicie sesión en `/admin` con una cuenta que figure en `stream_admins` y compruebe,
en una franja de prueba que luego borrará:

- Crear una franja con una opción HLS, una DASH y un enlace web; guardar y recargar.
- “Pick channels from a list (.m3u)” con una lista pública: debe mostrar canales,
  permitir buscarlos y rellenar la opción elegida.
- Una duración de varios días (hasta 92) y una de 5 minutos.
- Que un enlace con IP, `http://` o un puerto menor a 1024 se rechace con un mensaje claro.

## 4. Proteger la rama `main`

En GitHub: **Settings → Branches → Add branch ruleset** (o *Branch protection rule*)
para `main`:

- *Require a pull request before merging*.
- *Require status checks to pass*, con estos tres (aparecen tras una ejecución del CI):
  `Lint, typecheck, tests and build`, `Migrations (Postgres 16)` y `End-to-end (Playwright)`.
- *Require branches to be up to date before merging*.
- Opcional: *Block force pushes* y *Restrict deletions*.

Con eso un pull request con el CI en rojo no se puede mergear.

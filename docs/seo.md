# Buscadores y enlaces compartidos (SEO)

## Qué hay

- **`/robots.txt`** (`app/robots.ts`): permite todo salvo `/admin`, `/health`, `/watch/live` y
  `/watch/schedule`, y nombra el mapa del sitio. Las vistas previas (`?at=`) no se bloquean
  aquí: se excluyen con `noindex` en la propia página, que un rastreador solo puede leer si
  tiene permiso para entrar.
- **`/sitemap.xml`** (`app/sitemap.ts`): `/`, `/road-to` y `/watch`, con direcciones absolutas y
  sin `lastmod` (el contenido cambia con el reloj y la programación; una fecha inventada
  solo enseña a ignorarla).
- **Canónicas:** `/`, `/road-to` y `/watch`. Los enlaces profundos del relevo
  (`/watch?slot=…&stream=…`) apuntan a `/watch`.
- **Vistas previas** (`?at=&speed=`): `noindex, nofollow`, sin canónica ni datos estructurados, y se comparten con el título y la imagen de la edición simulada (`/share-image?year=`; las imágenes `/opengraph-image` y `/twitter-image` siguen el reloj real).
- **Endpoints de datos** (`/health`, `/watch/live`, `/watch/schedule`) y `/admin`: cabecera
  `X-Robots-Tag: noindex` (el admin, desde `proxy.ts`).
- **Imagen para compartir** (`/opengraph-image` y `/twitter-image`, `lib/og-image.tsx`): 1200×630,
  con la edición vigente (`#2027Live`) y sin horarios, programación ni cifras de audiencia.
  Tarjeta de Twitter `summary_large_image`.
- **HTML inicial:** la portada incluye en el servidor la frase “Follow the countdown to
  January 1, <año>…” (el contador en sí aparece al cargar el cliente) y un JSON-LD `WebSite`.
  No se declara `Event`: necesitaría una hora de inicio confirmada, y PRODUCT.md prohíbe inventar
  programación.
- Las direcciones no llevan el año, así que la autoridad se acumula de una edición a otra.

## Dominio del sitio

Las canónicas, el mapa del sitio y la imagen son absolutos. La base sale de, en este orden:
la variable `SITE_URL` (solo un origen: `https://su-dominio.example`, sin ruta), el dominio de
producción de Vercel (`VERCEL_PROJECT_PRODUCTION_URL`, el mismo en las vistas previas de
despliegue, para que ninguna se declare canónica) y, por último, `http://localhost:3000`.
No se usa `VERCEL_URL`: es la dirección de un despliegue concreto y cambiaría con cada
redespliegue. Si Vercel no expone la variable de dominio de producción (hay que dejar activada
«Automatically expose System Environment Variables»), cree `SITE_URL`.
**Si usa un dominio propio, cree `SITE_URL` en Vercel** (Production) y vuelva a desplegar.
`pnpm check:deployment https://su-sitio` falla si el mapa del sitio, la canónica o la imagen
no pertenecen al sitio que se está revisando (por ejemplo, un `SITE_URL` atrasado o con un
error de tipeo). Si revisa la dirección propia de un despliegue y es normal que las
direcciones apunten a su dominio, pase ese dominio con `--site=https://su-dominio`.

## Después de desplegar (lo que debe hacer usted)

1. **Google Search Console:** añada la propiedad (el dominio completo es lo más cómodo),
   verifíquela y envíe `https://su-dominio/sitemap.xml`. Haga lo mismo en **Bing Webmaster
   Tools** (puede importar la propiedad desde Search Console).
2. Pruebe una dirección con la **Inspección de URL** de Search Console y solicite la
   indexación de `/`, `/road-to` y `/watch`.
3. Compruebe la imagen al compartir pegando el enlace en un chat privado de Twitch, X o
   WhatsApp (las plataformas guardan la vista previa: para refrescarla, use el depurador de la
   plataforma).
4. Google tarda semanas en indexar: la demanda se concentra entre noviembre y enero, así que
   conviene hacerlo con antelación.

## Qué se comprueba solo

`e2e/seo.spec.ts` verifica `robots.txt`, el mapa, las canónicas, que una vista previa no sea
canónica, la imagen (HTTP 200, PNG), la tarjeta, el JSON-LD, la frase del HTML inicial y el
`noindex` de los endpoints de datos; `tests/streams/site.test.ts`, cómo se elige el dominio.

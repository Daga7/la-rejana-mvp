# Decisiones tomadas

Registro de las decisiones que no venían especificadas en el encargo, con su porqué. Las más recientes van al final de cada sección.

## Referencia y alcance

| # | Decisión | Por qué |
|---|----------|---------|
| D1 | Usé el demo (`Daga7/demo-rejana`) solo como guía visual y de flujos: paleta, tipografías, botones tipo sticker, banderines y las piezas gráficas (logo, stickers y animaciones de estado). El código se escribió de nuevo. | El demo es front-only con `localStorage`; la arquitectura pedida es distinta. Las piezas gráficas son de Daniel. |
| D2 | Sedes de prueba: **Villaluz** (dada en el encargo) y **Normandía** (inventada, barrio vecino). Direcciones, teléfonos y coordenadas son aproximados. | No hay información pública de las sedes reales. Se cambian desde Admin › Sedes. |
| D3 | Productos de ejemplo: 3 hamburguesas y 3 choriperros con ilustraciones vectoriales propias en estilo sticker. El «Choriperro Ranchero» solo se vende en Villaluz y Normandía arranca sin maduro para mostrar el menú por sede y el agotado automático. | El encargo pide 2–3 productos por categoría con foto; no hay fotos reales todavía (ver PENDIENTES). |
| D4 | El módulo de **mesero** queda para después del MVP: el rol existe, entra al buzón y ve una pantalla «próximamente». | Indicación de Daniel durante la sesión (nota de memoria del 2026-11-03); la sección 5.6 no lo pedía. |

## Arquitectura y stack

| # | Decisión | Por qué |
|---|----------|---------|
| D5 | Monorepo **pnpm**: `apps/api`, `apps/web`, `packages/shared`. | Un solo repositorio, esquemas de validación compartidos y despliegue por servicio. |
| D6 | **Fastify 5** como adaptador HTTP. | Rendimiento, plugins oficiales para Helmet, CORS, cookies y rate limiting, y buen soporte de TypeScript. |
| D7 | **Drizzle ORM** + `node-postgres`; migraciones SQL versionadas en `apps/api/drizzle/` generadas con drizzle-kit. | Consultas parametrizadas tipadas, SQL legible en las migraciones y sin binarios pesados (a diferencia de Prisma). |
| D8 | Esquemas **Zod 4** en `packages/shared`: la web valida con las mismas reglas que la API (la API siempre revalida). | Una sola fuente de verdad para formularios y entradas. |
| D9 | Casos de uso como funciones agrupadas por módulo que reciben un **actor** (usuario/invitado/sistema) y aplican permisos de rol y sede; los repositorios son interfaces en `ports/`. Unidad de trabajo para transacciones. | Hexagonal sin ceremonia: el dominio no conoce Fastify ni PostgreSQL. |
| D10 | Next.js 16 con **CSP estricta con nonce** por solicitud ⇒ todas las páginas se renderizan dinámicamente; **no** se activan `cacheComponents`/PPR. | Next documenta que PPR y los nonces son incompatibles. La seguridad (ASVS) pesa más que el prerender; las páginas son livianas. |
| D11 | **Proxy same-origin** `/api/*` en Next (route handler) hacia la API, con IP real del cliente y secreto compartido. | Con web en Vercel y API en Railway (dominios distintos) las cookies serían de terceros (Safari/Firefox las bloquean). Así son de primera parte (`SameSite=Strict`) y el rate limiting ve la IP real sin confiar en cabeceras falsificables. |
| D12 | Socket.IO directo a la API autenticado con un **ticket JWT de 2 minutos** pedido por REST. | Los proxies de Vercel no soportan WebSocket; el ticket evita depender de cookies de terceros. Socket.IO reconecta solo y cae a long-polling con conexiones inestables. |
| D13 | Configuración pública de la web (URL de tiempo real, teselas del mapa) leída **en tiempo de ejecución** y no con `NEXT_PUBLIC_*`. | Next no hornea variables del `.env` raíz del monorepo y así una misma imagen Docker sirve para cualquier entorno. |
| D14 | Service worker escrito a mano y servido desde `/sw.js` (route handler) con versión por despliegue. Estrategias: estáticos cache-first, páginas network-first con página offline, menú público network-first con caché, imágenes stale-while-revalidate, y **nunca** se cachean respuestas con datos personales. | Las librerías PWA de Next (next-pwa/serwist) dependen de webpack y Next 16 compila con Turbopack. |
| D15 | API empaquetada con **esbuild** (dependencias externas) e imagen Docker multi-etapa con `pnpm deploy --prod`. | Arranque rápido, imagen sin TypeScript ni herramientas de build. |
| D16 | `bcryptjs` (JS puro) con costo 12. | Evita compilar binarios nativos en Railway/Docker; el costo exigido se mantiene. |
| D17 | Rate limiting en memoria (un solo proceso). | Suficiente para el MVP. Con varias réplicas hay que pasar a Redis (y el adaptador Redis de Socket.IO). |
| D18 | Logger `pino` con redacción de cookies, tokens y contraseñas, y URLs registradas sin query string. | Que nada sensible quede en los logs. |
| D19 | Ícono de la PWA dibujado como vector (cielo nocturno, banderines y sticker rosa con la «R»). | El logo disponible mide 200 px; un ícono de 512 px nítido requería un vector. |

## Despliegue

| # | Decisión | Por qué |
|---|----------|---------|
| D20 | Railway con `railway.json` por servicio (Dockerfile, `preDeployCommand` de migraciones y health check). La web también puede ir a Vercel (raíz `apps/web`). | Lo pide el encargo; ambas rutas quedan documentadas. |
| D21 | El seed (con contraseñas conocidas) se niega a correr en producción. El primer admin de producción se crea con `crear-admin`, que emite una **invitación** de un solo uso. | No existen credenciales por defecto en producción. |
| D22 | Puertos locales 5433 (PostgreSQL) y 1025/8025 (Mailpit). | En el equipo ya corre otro PostgreSQL (`rejana-db`) en el 5432 de un intento anterior; no se toca. |

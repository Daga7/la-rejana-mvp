# La Rejana Callejera · MVP

PWA de domicilios + módulos de operación (cocina, caja, domiciliario y administración) para La Rejana Callejera (Bogotá).

- `apps/web` — Next.js 16 (App Router) + Tailwind 4, instalable como PWA.
- `apps/api` — Node.js + Fastify con arquitectura hexagonal (`domain`, `application`, `ports`, `adapters`).
- `packages/shared` — esquemas Zod, enums y utilidades compartidas.

Documentos del proyecto: **[INFORME.md](INFORME.md)** (estado final) · [PLAN.md](PLAN.md) · [PROGRESO.md](PROGRESO.md) · [DECISIONES.md](DECISIONES.md) · [PENDIENTES.md](PENDIENTES.md)

## Correr en local

Requisitos: Node ≥ 22.12 (probado con 24 y 26), pnpm 11 y Docker.

```bash
pnpm install
cp .env.example .env          # y cambia los secretos (openssl rand -base64 48)
pnpm db:up                    # PostgreSQL en :5433 y Mailpit en :8025
pnpm db:reset                 # migraciones + datos de prueba
pnpm dev                      # API en :4000 y web en :3000
```

- Web: http://localhost:3000 · Correos de desarrollo: http://localhost:8025
- Usuarios de prueba (contraseña `Rejana2026*`): `admin@larejana.test`, `cocina.villaluz@larejana.test`, `caja.villaluz@larejana.test`, `domi.villaluz@larejana.test`, `mesero.villaluz@larejana.test`, `cliente@larejana.test` (y los equivalentes `*.normandia@larejana.test`). En Villaluz hay mesas ocupadas de ejemplo para probar el módulo de mesero.

### Comandos útiles

| Comando | Qué hace |
|---|---|
| `pnpm test` | Pruebas (unitarias + integración contra `DATABASE_URL_TEST`) |
| `CHROMIUM_PATH=/usr/bin/chromium pnpm --filter @rejana/web e2e` | Pruebas de punta a punta en el navegador, con la app corriendo (`E2E_URL` si no es `http://localhost:3000`). La suite inicia sesión muchas veces: pon `LIMITE_INGRESOS_POR_MINUTO=60` en el `.env` local (en producción se ignora) |
| `pnpm typecheck` | Verificación de tipos en todos los paquetes |
| `pnpm build` | Compila API (esbuild) y web (Next standalone opcional) |
| `pnpm db:generate` | Genera una migración nueva a partir de `schema.ts` |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm --filter @rejana/api admin:crear correo@dominio` | Crea una invitación de un solo uso para un administrador |
| `pnpm --filter @rejana/web iconos` | Regenera íconos y pantallas de inicio de la PWA |

## Desplegar

### Railway (API + PostgreSQL, y opcionalmente la web)

1. Crea un proyecto en Railway y agrega **PostgreSQL**.
2. Crea el servicio **api** desde el repositorio. En *Settings › Config-as-code* usa `apps/api/railway.json` (construye con `apps/api/Dockerfile`, corre migraciones antes de cada despliegue y revisa `/api/salud`).
3. Variables del servicio api: copia las de `.env.example` (sección API) con valores de producción. Mínimo: `NODE_ENV=production`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `WEB_ORIGIN`, `API_PUBLIC_URL`, `JWT_SECRET`, `TOKENS_PEPPER`, `PROXY_SHARED_SECRET`, `COOKIE_SECURE=true`, `TRUST_PROXY_HOPS=1`, `OAUTH_MOCK=false`.
4. Servicio **web**: mismo repositorio con `apps/web/railway.json`. Variables: `API_INTERNAL_URL` (p. ej. `http://api.railway.internal:4000` por la red privada), `API_PUBLIC_URL`, `PROXY_SHARED_SECRET` (el mismo de la API), `MAPA_TESELAS_URL`, `MAPA_ATRIBUCION`.
5. Primer administrador: en la consola del servicio api ejecuta `node dist/crear-admin.js tu@correo.com` y abre el enlace que imprime.

### Vercel (solo la web)

Importa el repositorio con *Root Directory* `apps/web` (Vercel detecta pnpm y el monorepo). Define `API_INTERNAL_URL` (URL pública de la API en Railway), `API_PUBLIC_URL`, `PROXY_SHARED_SECRET`, `MAPA_TESELAS_URL` y `MAPA_ATRIBUCION`. En la API, `WEB_ORIGIN` debe ser el dominio de Vercel.

### Docker local

```bash
docker build -f apps/api/Dockerfile -t rejana-api .
docker build -f apps/web/Dockerfile --build-arg VERSION_APP=$(git rev-parse --short HEAD) -t rejana-web .
```

Las dos imágenes se probaron en modo producción contra la base local (API ~455 MB con salud OK; web ~393 MB sirviendo el menú prerenderizado por el proxy). `VERSION_APP` identifica el despliegue en el service worker; en Railway y Vercel se toma del commit automáticamente.

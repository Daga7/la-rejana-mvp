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

Destino: **Supabase** (PostgreSQL), **Railway** (API) y **Vercel** (web). Todo se configura desde el panel web de cada servicio, sin consola: las migraciones corren solas antes de cada despliegue, los datos de prueba se cargan solos al arrancar si los pides y el primer administrador puede recibir su invitación por correo.

```
Navegador ──HTTPS──▶ Vercel (web + proxy /api) ──HTTPS──▶ Railway (API) ──TLS, pooler en modo sesión──▶ Supabase
    └──────────────── WebSocket directo a la API (ticket de 2 minutos) ────────────┘
```

Pon los tres en la costa este de EE. UU. (Supabase *East US (North Virginia)*, Railway *US East* y Vercel *iad1*, el que viene por defecto): cada solicitud hace varias consultas a la base y así cada una tarda cerca de 1 ms (D107).

### 1. Supabase (base de datos)

1. **New project**, región **East US (North Virginia)**. Para la contraseña de la base usa *Generate a password* (solo letras y números: así no hay que codificar nada en la URL) y guárdala.
2. Botón **Connect** → **Session pooler** → copia la URI y cambia `[YOUR-PASSWORD]` por la contraseña, sin los corchetes. Esa es `DATABASE_URL`. No uses *Direct connection* (solo IPv6) ni *Transaction pooler* (puerto 6543).
3. Opcional, más seguro: *Project Settings → Database → SSL Configuration → Download certificate*. Abre el archivo y pega su contenido en la variable `DATABASE_SSL_CA` de Railway: así la API también verifica que habla con Supabase.

### 2. Railway (API): primera parte

1. **New Project → Deploy from GitHub repo** → `Daga7/la-rejana-mvp`. El primer despliegue va a fallar porque faltan las variables; es normal.
2. En el servicio, **Settings**:
   - *Config-as-code → Railway config file*: `/apps/api/railway.json` (construye con `apps/api/Dockerfile`, corre `node dist/migrar.js` antes de cada despliegue y revisa `/api/salud`).
   - *Root Directory*: vacío (la raíz del repo; el Dockerfile necesita el monorepo completo).
   - *Region*: US East.
   - *Networking → Generate Domain* con el puerto **8080**. Esa URL (`https://<algo>.up.railway.app`) es la de la API.

### 3. Vercel (web)

1. **Add New → Project** → importa `Daga7/la-rejana-mvp` (dale acceso al repositorio privado si te lo pide).
2. *Framework Preset*: Next.js. *Root Directory*: **`apps/web`**. No cambies los comandos de build ni de instalación. Deja activado que incluya los archivos fuera de esa carpeta (lo necesita `packages/shared`).
3. En *Environment Variables* pega la lista de abajo y dale **Deploy**. Al terminar, la URL de producción (`https://<proyecto>.vercel.app`, en *Settings → Domains*) es `WEB_ORIGIN`.

### 4. Railway (API): variables y despliegue

En *Variables → Raw Editor* pega la lista de la prueba con tus valores y despliega. En los logs deben salir `✔ Migraciones aplicadas` (fase *pre-deploy*) y luego `✔ Datos de prueba cargados`. `https://<api>.up.railway.app/api/salud` responde `{"estado":"ok","bd":"ok",…}`.

Los secretos se generan con el generador de contraseñas de tu gestor (48 caracteres o más, letras y números; el mínimo es 32). `PROXY_SHARED_SECRET` debe ser **igual** en Railway y en Vercel.

### Variables de Railway (API) para la prueba

```env
PORT=8080
DATABASE_URL=postgresql://postgres.<ref>:<contraseña>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
DATABASE_POOL_MAX=5
WEB_ORIGIN=https://<proyecto>.vercel.app
API_PUBLIC_URL=https://<api>.up.railway.app
JWT_SECRET=<secreto 1>
TOKENS_PEPPER=<secreto 2>
PROXY_SHARED_SECRET=<secreto 3>
COOKIE_SECURE=true
TRUST_PROXY_HOPS=1
OAUTH_MOCK=false
EMAIL_PROVEEDOR=consola
HIBP_HABILITADO=true
SEED_AL_INICIAR=true
SEED_PERMITIR_PRODUCCION=true
PERMITIR_PEDIDOS_FUERA_DE_HORARIO=true
```

- `PORT=8080`: Railway pone `PORT` si no la defines; fijarla hace que la API y el dominio generado usen el mismo puerto sin depender de la detección automática.
- `DATABASE_URL`: la URI del *Session pooler* tal como la da Supabase; el host exacto puede variar. Si trae `?sslmode=require` no pasa nada: la API lo quita y cifra igual (D97).
- `DATABASE_POOL_MAX=5`: en el plan gratis de Supabase el pool tiene 15 cupos, y durante un despliegue conviven dos versiones de la API (D99).
- `TRUST_PROXY_HOPS=1`: el borde de Railway es un salto (D103).
- `SEED_AL_INICIAR` y `SEED_PERMITIR_PRODUCCION`: cargan los datos de prueba **solo si la base está vacía**; reiniciar no los duplica (D101). Apágalos cuando quieras.
- `PERMITIR_PEDIDOS_FUERA_DE_HORARIO`: deja pedir a domicilio a cualquier hora, para probar.
- `EMAIL_PROVEEDOR=consola`: los correos (códigos de registro, recuperación, invitaciones) **no se envían**: quedan en los logs de Railway (busca «Correo (modo consola)»).
- No hace falta definir `NODE_ENV`, `HOST`, `MIGRACIONES_DIR` ni `NODE_OPTIONS`: vienen en la imagen. La API usa unos 85 MB en reposo y unos 140 MB con mucha carga (D104).
- Sin `GOOGLE_*` ni `APPLE_*`, las pantallas de acceso no muestran esos botones (D105). Sin llaves `VAPID_*`, el botón de notificaciones avisa que aún no están configuradas; el seguimiento en vivo funciona igual.

### Variables de Vercel (web), para la prueba y producción

```env
API_INTERNAL_URL=https://<api>.up.railway.app
API_PUBLIC_URL=https://<api>.up.railway.app
PROXY_SHARED_SECRET=<secreto 3, el mismo de Railway>
ENABLE_EXPERIMENTAL_COREPACK=1
```

- `API_INTERNAL_URL` es a dónde reenvía el proxy `/api/*`; `API_PUBLIC_URL` es la URL del WebSocket y entra en la CSP (`https://` y `wss://`). Las dos son la URL pública de Railway.
- `ENABLE_EXPERIMENTAL_COREPACK=1` hace que Vercel use el pnpm 11 de `packageManager` (D106).
- Opcionales en producción: `MAPA_TESELAS_URL` y `MAPA_ATRIBUCION`, para un proveedor de mapas con llave (por defecto, OpenStreetMap).
- Vercel solo aplica los cambios de variables en un despliegue nuevo (*Deployments → Redeploy*).

### Usuarios de la prueba

Los mismos de desarrollo, con la contraseña `Rejana2026*`: `admin@larejana.test`, `cocina.villaluz@larejana.test`, `caja.villaluz@larejana.test`, `domi.villaluz@larejana.test`, `mesero.villaluz@larejana.test`, `cliente@larejana.test` y los `*.normandia@larejana.test`. La clienta tiene el Pasaporte activo con 5 sellos (su código está en `/pasaporte`), y en Villaluz hay mesas ocupadas de ejemplo. **Esta contraseña es pública**: no uses esta base para clientes reales.

### Antes de abrir al público

1. **Base nueva**: crea otro proyecto en Supabase (vacío) y cambia `DATABASE_URL` en Railway. Así desaparecen los usuarios de prueba y los pedidos de ejemplo sin borrar nada a mano (D109). Agrega `DATABASE_SSL_CA` y, en Supabase, activa *Enforce SSL on incoming connections*.
2. **Quita** de Railway `SEED_AL_INICIAR`, `SEED_PERMITIR_PRODUCCION` y `PERMITIR_PEDIDOS_FUERA_DE_HORARIO`.
3. **Rota los tres secretos** con valores nuevos: `JWT_SECRET`, `TOKENS_PEPPER` y `PROXY_SHARED_SECRET`. Este último también en Vercel, y luego *Redeploy*. Hazlo con la base nueva, antes de que haya usuarios reales: cambiar `TOKENS_PEPPER` invalida todas las contraseñas (D60).
4. **Correo real**: `EMAIL_PROVEEDOR=resend`, `RESEND_API_KEY` y `EMAIL_REMITENTE` con un dominio verificado (o `smtp` con `SMTP_*`).
5. **Tu administrador**: agrega `ADMIN_INICIAL_CORREO=<tu correo>` y despliega. Te llega una invitación que vence en 2 horas; crea tu contraseña y luego borra la variable. Si el enlace vence, reinicia el servicio y te llega otro (D102).
6. Opcionales: llaves `VAPID_*` para push, `GOOGLE_*` y `APPLE_*`, `WHATSAPP_*`, `IA_PROVEEDOR=anthropic` con `ANTHROPIC_API_KEY`, `STT_*` y mapas con llave (ver [PENDIENTES.md](PENDIENTES.md)).
7. **Borra o pausa el proyecto de Supabase de la prueba**: tiene usuarios con una contraseña publicada.
8. **Vercel**: el plan Hobby no permite uso comercial, así que necesitas Pro (o correr la web en Railway con `apps/web/Dockerfile`). Si pones un dominio propio, actualiza `WEB_ORIGIN` en Railway.

Sin consola, `crear-admin` no hace falta. Desde una consola sigue disponible: `node dist/crear-admin.js correo@dominio` (invitación de 72 horas).

### Docker local

```bash
docker build -f apps/api/Dockerfile -t rejana-api .
docker build -f apps/web/Dockerfile --build-arg VERSION_APP=$(git rev-parse --short HEAD) -t rejana-web .
```

La imagen de la API pesa unos 457 MB y se probó en modo producción contra Supavisor (el pooler de Supabase) con TLS: migraciones, seed al arrancar, inicio de sesión y carga. La de la web (standalone, unos 393 MB) sirve para correrla con Docker fuera de Vercel. `VERSION_APP` identifica el despliegue en el service worker; en Vercel se toma sola del commit.

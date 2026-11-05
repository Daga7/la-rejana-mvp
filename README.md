# La Rejana Callejera · MVP

PWA de domicilios + módulos de operación (cocina, caja, domiciliario y administración) para La Rejana Callejera (Bogotá).

- `apps/web` — Next.js 16 (App Router) + Tailwind 4, instalable como PWA. Es el único desplegable: sus route handlers (`/api/*`) sirven también el backend, en el mismo proceso.
- `packages/server` — backend con arquitectura hexagonal (`domain`, `application`, `ports`, `adapters`). No es un servicio aparte: `apps/web` lo importa y lo monta dentro de sus route handlers.
- `packages/shared` — esquemas Zod, enums y utilidades compartidas.

Documentos del proyecto: **[INFORME.md](INFORME.md)** (estado final) · [PLAN.md](PLAN.md) · [PROGRESO.md](PROGRESO.md) · [DECISIONES.md](DECISIONES.md) · [PENDIENTES.md](PENDIENTES.md)

## Correr en local

Requisitos: Node ≥ 22.12 (probado con 24 y 26), pnpm 11 y Docker.

```bash
pnpm install
cp .env.example .env          # y cambia los secretos (openssl rand -base64 48)
pnpm db:up                    # PostgreSQL en :5433 y Mailpit en :8025
pnpm db:reset                 # migraciones + datos de prueba
pnpm dev                      # web (con el backend dentro) en :3000
```

- Web: http://localhost:3000 · Correos de desarrollo: http://localhost:8025
- Usuarios de prueba (contraseña `Rejana2026*`): `admin@larejana.test`, `cocina.villaluz@larejana.test`, `caja.villaluz@larejana.test`, `domi.villaluz@larejana.test`, `mesero.villaluz@larejana.test`, `cliente@larejana.test` (y los equivalentes `*.normandia@larejana.test`). En Villaluz hay mesas ocupadas de ejemplo para probar el módulo de mesero.

### Comandos útiles

| Comando | Qué hace |
|---|---|
| `pnpm test` | Pruebas (unitarias + integración contra `DATABASE_URL_TEST`) |
| `CHROMIUM_PATH=/usr/bin/chromium pnpm --filter @rejana/web e2e` | Pruebas de punta a punta en el navegador, con la app corriendo (`E2E_URL` si no es `http://localhost:3000`). La suite inicia sesión muchas veces: pon `LIMITE_INGRESOS_POR_MINUTO=60` en el `.env` local (en producción se ignora) |
| `pnpm typecheck` | Verificación de tipos en todos los paquetes |
| `pnpm build` | Compila la web (Next.js), con el backend incluido |
| `pnpm db:generate` | Genera una migración nueva a partir de `schema.ts` |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm --filter @rejana/server admin:crear correo@dominio` | Crea una invitación de un solo uso para un administrador |
| `pnpm --filter @rejana/web iconos` | Regenera íconos y pantallas de inicio de la PWA |

## Desplegar

Destino: **Supabase** (PostgreSQL + Realtime) y **Vercel** (web, con el backend dentro de sus route handlers — un solo servicio, sin API aparte). Todo se configura desde el panel web de cada servicio, sin consola: las migraciones corren con un script antes de cada despliegue, los datos de prueba se cargan solos al arrancar si los pides y el primer administrador puede recibir su invitación por correo.

```
Navegador ──HTTPS──▶ Vercel (Next.js: páginas + /api/* + /api/realtime/stream) ──TLS, pooler en modo sesión──▶ Supabase (Postgres)
                                        └──────── WebSocket de servidor (llave de servicio) ────────▶ Supabase Realtime
```

El tiempo real va por *Server-Sent Events* del navegador a `/api/realtime/stream` (mismo origen: la cookie de sesión ya autentica). La propia función de Vercel reenvía los eventos que recibe de Supabase Realtime; el navegador nunca se conecta directo a Supabase.

Pon los dos en la costa este de EE. UU. (Supabase *East US (North Virginia)* y Vercel *iad1*, el que viene por defecto): cada solicitud hace varias consultas a la base y así cada una tarda cerca de 1 ms (D107).

### 1. Supabase (base de datos + tiempo real)

1. **New project**, región **East US (North Virginia)**. Para la contraseña de la base usa *Generate a password* (solo letras y números: así no hay que codificar nada en la URL) y guárdala.
2. Botón **Connect** → **Session pooler** → copia la URI y cambia `[YOUR-PASSWORD]` por la contraseña, sin los corchetes. Esa es `DATABASE_URL`. No uses *Direct connection* (solo IPv6) ni *Transaction pooler* (puerto 6543).
3. Opcional, más seguro: *Project Settings → Database → SSL Configuration → Download certificate*. Abre el archivo y pega su contenido en la variable `DATABASE_SSL_CA` de Vercel: así la API también verifica que habla con Supabase.
4. *Project Settings → Data API* → copia la **Project URL** (`SUPABASE_URL`) y la **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`, en *API Keys*). Realtime viene activado por defecto; no hace falta crear tablas ni políticas (el backend publica y suscribe con la llave de servicio, sin pasar por RLS).

### 2. Vercel (web + backend)

1. **Add New → Project** → importa `Daga7/la-rejana-mvp` (dale acceso al repositorio privado si te lo pide).
2. *Framework Preset*: Next.js. *Root Directory*: **`apps/web`**. No cambies los comandos de build ni de instalación. Deja activado que incluya los archivos fuera de esa carpeta (lo necesitan `packages/shared` y `packages/server`).
3. En *Environment Variables* pega la lista de abajo y dale **Deploy**. Al terminar, la URL de producción (`https://<proyecto>.vercel.app`, en *Settings → Domains*) es `WEB_ORIGIN` (ponla también como variable y vuelve a desplegar).
4. Corre las migraciones una vez (local, apuntando a Supabase): `DATABASE_URL=<tu URL de Supabase> DATABASE_SSL=true pnpm db:migrate`. Sin esto, la base queda sin tablas.

Los secretos se generan con el generador de contraseñas de tu gestor (48 caracteres o más, letras y números; el mínimo es 32).

### Variables de Vercel, para la prueba

```env
DATABASE_URL=postgresql://postgres.<ref>:<contraseña>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
DATABASE_POOL_MAX=5
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
WEB_ORIGIN=https://<proyecto>.vercel.app
JWT_SECRET=<secreto 1>
TOKENS_PEPPER=<secreto 2>
COOKIE_SECURE=true
OAUTH_MOCK=false
EMAIL_PROVEEDOR=consola
HIBP_HABILITADO=true
SEED_AL_INICIAR=true
SEED_PERMITIR_PRODUCCION=true
PERMITIR_PEDIDOS_FUERA_DE_HORARIO=true
ENABLE_EXPERIMENTAL_COREPACK=1
```

- `DATABASE_URL`: la URI del *Session pooler* tal como la da Supabase; el host exacto puede variar. Si trae `?sslmode=require` no pasa nada: la API lo quita y cifra igual (D97).
- `DATABASE_POOL_MAX=5`: en el plan gratis de Supabase el pool tiene 15 cupos, y durante un despliegue conviven dos versiones de la función (D99).
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: sin ellas, la app funciona pero sin tiempo real (las pantallas se actualizan solo al recargar o al volver a pedir datos).
- `SEED_AL_INICIAR` y `SEED_PERMITIR_PRODUCCION`: cargan los datos de prueba **solo si la base está vacía**, la primera vez que una función los ejecuta; reiniciar no los duplica (D101). Apágalos cuando quieras.
- `PERMITIR_PEDIDOS_FUERA_DE_HORARIO`: deja pedir a domicilio a cualquier hora, para probar.
- `EMAIL_PROVEEDOR=consola`: los correos (códigos de registro, recuperación, invitaciones) **no se envían**: quedan en los *Logs* de Vercel (busca «Correo (modo consola)»).
- `ENABLE_EXPERIMENTAL_COREPACK=1` hace que Vercel use el pnpm 11 de `packageManager` (D106).
- Opcionales en producción: `MAPA_TESELAS_URL` y `MAPA_ATRIBUCION`, para un proveedor de mapas con llave (por defecto, OpenStreetMap).
- Sin `GOOGLE_*` ni `APPLE_*`, las pantallas de acceso no muestran esos botones (D105). Sin llaves `VAPID_*`, el botón de notificaciones avisa que aún no están configuradas; el seguimiento en vivo funciona igual.
- Vercel solo aplica los cambios de variables en un despliegue nuevo (*Deployments → Redeploy*).

### Usuarios de la prueba

Los mismos de desarrollo, con la contraseña `Rejana2026*`: `admin@larejana.test`, `cocina.villaluz@larejana.test`, `caja.villaluz@larejana.test`, `domi.villaluz@larejana.test`, `mesero.villaluz@larejana.test`, `cliente@larejana.test` y los `*.normandia@larejana.test`. La clienta tiene el Pasaporte activo con 5 sellos (su código está en `/pasaporte`), y en Villaluz hay mesas ocupadas de ejemplo. **Esta contraseña es pública**: no uses esta base para clientes reales.

### Antes de abrir al público

1. **Base nueva**: crea otro proyecto en Supabase (vacío) y cambia `DATABASE_URL` (y `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) en Vercel. Así desaparecen los usuarios de prueba y los pedidos de ejemplo sin borrar nada a mano (D109). Agrega `DATABASE_SSL_CA` y, en Supabase, activa *Enforce SSL on incoming connections*.
2. **Quita** de Vercel `SEED_AL_INICIAR`, `SEED_PERMITIR_PRODUCCION` y `PERMITIR_PEDIDOS_FUERA_DE_HORARIO`.
3. **Rota los dos secretos** con valores nuevos: `JWT_SECRET` y `TOKENS_PEPPER`. Hazlo con la base nueva, antes de que haya usuarios reales: cambiarlos invalida todas las contraseñas (D60).
4. **Correo real**: `EMAIL_PROVEEDOR=resend`, `RESEND_API_KEY` y `EMAIL_REMITENTE` con un dominio verificado (o `smtp` con `SMTP_*`).
5. **Tu administrador**: agrega `ADMIN_INICIAL_CORREO=<tu correo>` y despliega. Te llega una invitación que vence en 2 horas; crea tu contraseña y luego borra la variable. Si el enlace vence, haz un redeploy y te llega otro (D102).
6. Opcionales: llaves `VAPID_*` para push, `GOOGLE_*` y `APPLE_*`, `WHATSAPP_*`, `IA_PROVEEDOR=anthropic` con `ANTHROPIC_API_KEY`, `STT_*` y mapas con llave (ver [PENDIENTES.md](PENDIENTES.md)).
7. **Borra o pausa el proyecto de Supabase de la prueba**: tiene usuarios con una contraseña publicada.
8. **Vercel**: el plan Hobby no permite uso comercial, así que necesitas Pro. Si pones un dominio propio, actualiza `WEB_ORIGIN`.

Sin consola, `crear-admin` no hace falta. Desde una consola sigue disponible: `node_modules/.bin/tsx packages/server/src/adapters/db/crear-admin.ts correo@dominio` (invitación de 72 horas), con `DATABASE_URL` y `TOKENS_PEPPER` de producción en el entorno.

### Docker local

```bash
docker build -f apps/web/Dockerfile --build-arg VERSION_APP=$(git rev-parse --short HEAD) -t rejana-web .
```

Una sola imagen (standalone, web + backend) para correr fuera de Vercel; necesita las mismas variables de entorno que en producción. `VERSION_APP` identifica el despliegue en el service worker; en Vercel se toma sola del commit.

# Progreso

> Si la sesión se corta, lee este archivo primero: dice qué está hecho, qué falta y el **siguiente paso exacto**.

## Estado por fase

| Fase | Estado | Commit |
|---|---|---|
| 1. Base, hexagonal, BD, PWA, despliegue | ✅ Hecha | `chore: scaffold monorepo with api, web pwa and db` |
| 2. Autenticación completa | ✅ Hecha | `feat(auth): add registration, sessions, oauth and invitations` |
| 3. Menú, recetas e inventario | ⏳ Siguiente | — |
| 4. Pedidos a domicilio, estados y push | Pendiente | — |
| 5. Domiciliario: tiempo real y ruta óptima | Pendiente | — |
| 6. Cocina, caja y admin | Pendiente | — |
| 7. Buzón de quejas | Pendiente | — |
| 8. Asistente de WhatsApp con PDF | Pendiente | — |
| Cierre: seguridad, audit, Lighthouse, INFORME | Pendiente | — |

## Fase 1 — qué quedó

- Monorepo pnpm (`apps/api`, `apps/web`, `packages/shared`), Docker Compose (PostgreSQL 17 en :5433 + Mailpit en :8025).
- **Dominio** puro con pruebas: permisos por rol y sede, máquina de estados del pedido, inventario por receta (unidades preparables, faltantes, stock bajo), optimizador de rutas exacto (Held-Karp + partición en salidas), periodos de reportes en hora de Bogotá. 29 pruebas unitarias en verde.
- **Puertos** completos (`ports/repositorios.ts`, `ports/servicios.ts`) y **adaptadores** PostgreSQL/Drizzle para todos los repositorios, seguridad (bcrypt 12, JWT `jose` con llaves derivadas por propósito, HMAC, HIBP), correo (consola/SMTP/Resend), push (Web Push/consola), mapas (haversine/OSRM/Google + Nominatim/Google), publicador Socket.IO.
- Esquema de BD (25 tablas) con migración versionada `drizzle/0000_inicial.sql`, CHECKs de negocio (inventario ≥ 0, buzón anónimo sin autor, totales) y seed con 2 sedes, menú distinto por sede, recetas, inventario, 10 usuarios de prueba, 60 días de histórico y pedidos vivos.
- Servidor Fastify: IP real vía proxy con secreto compartido, Helmet (CSP `default-src 'none'`, HSTS en producción), CORS restringido, rate limiting global, CSRF (Origin + doble envío), errores sin filtrar detalles, logs con redacción. `GET /api/salud`.
- Web Next.js 16: tema de marca, fuentes, pantalla inicial con las 3 opciones, aviso de privacidad (Ley 1581), página offline, manifest, íconos y splash generados, service worker versionado (caché + push), proxy same-origin `/api/*`, CSP con nonce, cabeceras de seguridad, configuración pública en tiempo de ejecución.
- Despliegue: build de API con esbuild, Dockerfiles multi-etapa (probados localmente: API 453 MB, web 389 MB), `railway.json` por servicio, CI de GitHub Actions, script `crear-admin` (invitación de un solo uso).

## Fase 2 — qué quedó

- Casos de uso en `apps/api/src/application/auth.ts`: registro con código (cuenta creada al verificar, código ligado al navegador), verificación (10 min, 5 intentos), reenvío (60 s de espera, 5 por hora), login con bloqueo de 15 min tras 5 fallos, sesiones con refresh rotativo y detección de reuso, salir, cambiar clave (cierra las demás sesiones), recuperar/restablecer clave (cierra todas), OAuth Google/Apple/simulado con state + nonce + PKCE, invitaciones de empleados (72 h, un uso, mismo correo).
- Adaptadores: `adapters/oauth/proveedores.ts` (Google, Apple con secreto ES256, simulado), plantillas de correo con escape de HTML.
- Rutas en `adapters/http/rutas/auth.ts` con rate limiting por ruta, cookies `httpOnly`/`SameSite=Strict` (`__Host-` en producción) y pista `rj_hay_sesion`.
- Migración `0001` (registro pendiente y vínculo del código).
- Web: `/ingresar`, `/registro`, `/verificar`, `/recuperar`, `/invitacion`, `/cuenta`, `/mesero` (provisional), guardián `RequiereSesion`, cliente API con CSRF y refresco automático.
- Pruebas: 24 de integración de autenticación (total 53 en verde). Prueba e2e manual: registro por el proxy de la web con el correo real en Mailpit.

## Siguiente paso exacto

**Fase 3 — Menú, recetas e inventario.** Crear `apps/api/src/application/menu.ts` (menú público por sede con `maxUnidades` y `agotado` calculados desde el inventario; CRUD admin de categorías, productos, receta y menú por sede) y `application/inventario.ts` (listado por sede, entradas y ajustes con movimientos, stock mínimo, alertas), sus rutas y pruebas (descuento por receta va en la fase 4 con los pedidos). En la web: tienda `/menu` (selector de sede, categorías, tarjetas con agotado, carrito en `zustand` persistente) y pantallas de admin de catálogo/inventario (pueden quedar básicas y completarse en la fase 6).

## Cómo verificar lo hecho

```bash
pnpm db:up && pnpm db:reset
pnpm --filter @rejana/api test     # 29 pruebas
pnpm dev                           # http://localhost:3000 y http://localhost:4000/api/salud
```

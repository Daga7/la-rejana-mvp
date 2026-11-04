# Progreso

> Si la sesión se corta, lee este archivo primero: dice qué está hecho, qué falta y el **siguiente paso exacto**.

## Estado por fase

| Fase | Estado | Commit |
|---|---|---|
| 1. Base, hexagonal, BD, PWA, despliegue | ✅ Hecha | `chore: scaffold monorepo with api, web pwa and db` |
| 2. Autenticación completa | ⏳ Siguiente | — |
| 3. Menú, recetas e inventario | Pendiente | — |
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

## Siguiente paso exacto

**Fase 2 — Autenticación.** Crear `apps/api/src/application/auth.ts` (registro con código, verificación, login con bloqueo, refresh rotativo con detección de reuso, salir, cambiar/recuperar clave, OAuth Google/Apple/mock, invitaciones) + plantillas de correo + rutas `apps/api/src/adapters/http/rutas/auth.ts` (incluye `GET /api/auth/csrf` y cookie `rj_hay_sesion`) + pruebas de integración en `apps/api/test/integracion/`. Luego las pantallas `/ingresar`, `/registro`, `/verificar`, `/recuperar`, `/invitacion` y `/cuenta` en la web.

## Cómo verificar lo hecho

```bash
pnpm db:up && pnpm db:reset
pnpm --filter @rejana/api test     # 29 pruebas
pnpm dev                           # http://localhost:3000 y http://localhost:4000/api/salud
```

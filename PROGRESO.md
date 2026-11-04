# Progreso

> Si la sesión se corta, lee este archivo primero: dice qué está hecho, qué falta y el **siguiente paso exacto**.

## Estado por fase

| Fase | Estado | Commit |
|---|---|---|
| 1. Base, hexagonal, BD, PWA, despliegue | ✅ Hecha | `chore: scaffold monorepo with api, web pwa and db` |
| 2. Autenticación completa | ✅ Hecha | `feat(auth): add registration, sessions, oauth and invitations` |
| 3. Menú, recetas e inventario | ✅ Hecha | `feat(menu): add per-branch menu, recipes and inventory` |
| 4. Pedidos a domicilio, estados y push | ✅ Hecha | `feat(pedidos): add delivery orders, push and live tracking` |
| 5. Domiciliario: tiempo real y ruta óptima | ⏳ Siguiente | — |
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

## Fase 3 — qué quedó

- `application/menu.ts`: sedes públicas (abierta/cerrada en hora de Bogotá), menú por sede con precio por sede, **agotado automático** (`maxUnidades` = insumo más escaso según receta; interruptor manual por sede), CRUD de categorías, productos (slug único), recetas y menú por sede, CRUD de sedes. Cambios de precio, receta y menú quedan en auditoría.
- `application/inventario.ts`: inventario por sede con capacidad por producto y alertas, entradas (sumar) y conteos físicos (fijar) con movimientos y auditoría, stock mínimo configurable, alertas en tiempo real, CRUD de insumos (no deja cambiar la unidad con existencias).
- Rutas `adapters/http/rutas/menu.ts` (públicas, `/api/admin/*` e `/api/inventario/:sede`).
- Web: grupo `(cliente)` con encabezado, navegación inferior y botón de carrito animado; tienda `/menu` (portada, selector de sede con confirmación si el carrito es de otra sede, categorías fijas, tarjetas con agotado y «¡quedan N!», hoja de producto con cantidad y notas, esqueletos de carga, barra flotante); carrito persistente en `localStorage` (`lib/carrito.ts`) con clave de idempotencia para el checkout.
- Pruebas: 14 nuevas de menú/inventario/permisos (total 67 en verde).
- Las pantallas de administración de catálogo e inventario se hacen en la fase 6 (la API ya está lista).

## Fase 4 — qué quedó

- `application/pedidos.ts`: crear (servidor fija precios, valida sede activa/abierta, cobertura y disponibilidad, idempotencia, transacción con bloqueo de insumos y descuento por receta, token para invitados, dirección guardada), obtener (dueño, invitado con token, personal de la sede, domiciliario asignado; si no, 404), mis pedidos, pedidos del invitado en el dispositivo, tablero de operación por sede, cambiar estado (máquina de estados + rol + sede + «asignado a ti»), asignar domiciliario, cancelar (con reposición según estado), registrar pago (cambio) y cerrar. Push en cada cambio y eventos Socket.IO.
- `application/push.ts`: suscripciones Web Push (lista blanca anti-SSRF), tickets de tiempo real con salas por pedido/sede/domiciliario/admin. Servidor Socket.IO autenticado por ticket (`adapters/realtime/servidor.ts`).
- Rutas `adapters/http/rutas/pedidos.ts` (+ direcciones guardadas y geocodificación `/api/geo/*`).
- Web: `/carrito` (sincroniza precios y agotados), `/checkout` (mapa Leaflet con pin y radio de cobertura, ubicación del dispositivo, buscador de direcciones, direcciones guardadas, efectivo con «paga con» o QR, autorización de datos para invitados, idempotencia), `/pedido/[id]` (pasos animados, ilustraciones por estado, tiempo real con respaldo por sondeo, mapa y ETA cuando va en camino, activar push, QR de pago, cancelar), `/mis-pedidos` (cuenta o dispositivo).
- Pruebas: 17 de pedidos (descuento exacto por receta, reposición, concurrencia sin sobreventa, idempotencia, acceso por token, flujo cocina→caja→domiciliario con permisos de rol/sede, push, anti-SSRF, cobro y cierre) + 3 de tiempo real con Socket.IO real + 3 de reglas de sede. **Total 93 en verde.** E2E en navegador: compra como invitado de punta a punta con actualización en vivo.

## Siguiente paso exacto

**Fase 5 — Domiciliario.** Crear `application/domicilios.ts`: pedidos asignados al domiciliario, `planificarRuta` (matriz de tiempos con el puerto de mapas + `domain/ruta.ts`, límite por sede, enlaces Google Maps/Waze), `iniciarRecorrido` (crea recorrido, pasa los pedidos a «en camino», push), `actualizarUbicacion` (solo con recorrido activo; calcula ETA por parada y emite `pedido:ubicacion` solo a las salas de los pedidos en camino), `finalizarRecorrido` (borra la ubicación). Manejador Socket.IO para `ubicacion` + ruta REST de respaldo. Pantalla `/domiciliario` (lista, planificador con sugerencia de dividir salidas, iniciar recorrido con `watchPosition`, marcar entregado, abrir en Maps/Waze). Pruebas de privacidad de la ubicación.

## Cómo verificar lo hecho

```bash
pnpm db:up && pnpm db:reset
pnpm --filter @rejana/api test     # pruebas unitarias + integración
CHROMIUM_PATH=/usr/bin/chromium pnpm --filter @rejana/web e2e   # con la app corriendo (pnpm dev)
pnpm dev                           # http://localhost:3000 y http://localhost:4000/api/salud
```

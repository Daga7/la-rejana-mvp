# Progreso

> Si la sesión se corta, lee este archivo primero: dice qué está hecho, qué falta y el **siguiente paso exacto**.

## Estado por fase

| Fase | Estado | Commit |
|---|---|---|
| 1. Base, hexagonal, BD, PWA, despliegue | ✅ Hecha | `chore: scaffold monorepo with api, web pwa and db` |
| 2. Autenticación completa | ✅ Hecha | `feat(auth): add registration, sessions, oauth and invitations` |
| 3. Menú, recetas e inventario | ✅ Hecha | `feat(menu): add per-branch menu, recipes and inventory` |
| 4. Pedidos a domicilio, estados y push | ✅ Hecha | `feat(pedidos): add delivery orders, push and live tracking` |
| 5. Domiciliario: tiempo real y ruta óptima | ✅ Hecha | `feat(domicilios): add optimal routes and live courier tracking` |
| 6. Cocina, caja y admin | ✅ Hecha | `feat(operacion): add kitchen, cashier and admin modules` |
| 7. Buzón de quejas | ✅ Hecha | `feat(buzon): add anonymous staff feedback mailbox` |
| 8. Asistente de WhatsApp con PDF | ✅ Hecha | `feat(asistente): add whatsapp report assistant with pdf` |
| Cierre: seguridad, audit, Lighthouse, INFORME | ✅ Hecho | `fix(seguridad): pre-hash passwords and harden api caching`, `perf(web): reach lighthouse 90+ on public pages`, `docs: add final report and closing notes` |
| 9. Módulo de mesero (después del MVP) | ✅ Hecha | `feat(mesero): add table service and checkout` |
| 10. Lote 2: plano, mesas, turnos, Pasaporte y propina | ✅ Hecha | `fix(mesas): accept only a 0 or 10% tip`, `feat(turnos): add staff clock-in and admin hours`, `feat(mesas): add floor plan per zone`, `feat(mesas): move, join and split tables`, `feat(pasaporte): add opt-in stamp card and rewards`, `fix(web): refresh salon after table changes`, `test(e2e): cover moving tables, shifts and passport` |
| 11. Despliegue: Supabase, Railway y Vercel | ✅ Listo para configurar (sin desplegar) | `feat(api): connect through supabase session pooler`, `feat(api): seed and invite first admin at startup`, `perf(api): cap node heap size in docker image`, `fix(web): show only configured oauth providers`, `chore(web): drop railway config for vercel`, `fix(web): run unit tests only from src`, `fix(docker): drop buildkit cache mounts for railway`, `docs: document supabase, railway and vercel deploy`, `docs: record ci and railway build fixes` |

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
- Pruebas: 17 de pedidos (descuento exacto por receta, reposición, concurrencia sin sobreventa, idempotencia, acceso por token, flujo cocina→caja→domiciliario con permisos de rol/sede, push, anti-SSRF, cobro y cierre) + 3 de tiempo real con Socket.IO real + 3 de reglas de sede. **Total 90 en verde.** E2E en navegador: compra como invitado de punta a punta con actualización en vivo.

## Fase 5 — qué quedó

- `application/domicilios.ts`: pedidos asignados al domiciliario, planificación de ruta (matriz del puerto de mapas + optimizador exacto, límite de la sede, sugerencia de dividir salidas, enlaces Google Maps/Waze), iniciar recorrido (pedidos a «en camino» con push), ubicación en vivo con ETA por parada solo para los pedidos en camino del recorrido, entregar (cierra el recorrido al terminar y borra la ubicación), finalizar. Si la caja cancela un pedido en camino, se deja de compartir la ubicación con ese cliente.
- Rutas `adapters/http/rutas/domicilios.ts` y manejador Socket.IO `ubicacion` (revalida el usuario en cada envío).
- Web: marco común del personal (`componentes/personal/MarcoPersonal.tsx`) y `/domiciliario` (listos para salir / en cocina, planificador, recorrido con GPS `watchPosition`, Wake Lock, cobro y cambio, Maps/Waze, entregar).
- Pruebas: 5 de integración con Socket.IO real (una salida vs. dividir, permisos, privacidad de la ubicación, cierre del recorrido). **Total 95 en verde.** E2E con dos navegadores: el cliente ve al domiciliario acercarse con ETA y la entrega en vivo.

## Fase 6 — qué quedó

- API: `application/reportes.ts` (**catálogo cerrado**: ventas por periodo y sede con serie diaria, productos más vendidos, inventario por insumo y sede con filtro sin tildes; tablero del admin) y `application/admin.ts` (empleados, cambio de rol/sede/estado/WhatsApp con cierre de sesiones y auditoría, auditoría paginada). Rutas `adapters/http/rutas/admin.ts`.
- Web: `/cocina` (tres columnas en vivo, cambio de estado con un toque optimista, minutos con color, campana), `/caja` (pestañas por etapa con contadores, asignar domiciliario, despachar, entregar, cobrar con cambio, cerrar, cancelar con reposición opcional), `/admin` (tablero con KPIs, líneas por sede, barras de lo más vendido, resumen por sede y alertas), `/admin/inventario`, `/admin/menu` (precio y disponibilidad por sede, editor de recetas, productos y categorías), `/admin/sedes`, `/admin/empleados` (invitar, pendientes, editar) y `/admin/auditoria`. Componentes de gráficas en `componentes/graficas/`.
- Pruebas: 9 de integración (reportes cuadran con la BD, filtros, permisos, empleados). **Total 104 en verde.** E2E: tablero + inventario (admin), cocina y caja en navegador.

## Fase 7 — qué quedó

- `application/buzon.ts` + rutas: enviar (cualquier empleado; anónimo sin autor/sede/hora, sin auditoría ni log), listar y cambiar estado (solo admin, auditado).
- Web: `/buzon` (sugerencia/queja, anónimo por defecto con explicación) y `/admin/buzon` (filtros por estado, cambio de estado).
- Pruebas: 5 de integración (incluye verificar columna por columna que un anónimo no guarda nada del autor y que el CHECK lo impide). **Total 109 en verde.** E2E del flujo en navegador.

## Fase 8 — qué quedó

- Adaptadores: WhatsApp Cloud API (`adapters/whatsapp/whatsapp.ts`) + consola, transcripción compatible con OpenAI + simulada, intérprete con Claude (`adapters/ia/interprete-anthropic.ts`, salidas estructuradas) + por reglas, PDF con pdfkit y fuentes de marca (`adapters/pdf/generador-pdfkit.ts`).
- `application/asistente.ts`: lista blanca, idempotencia, límite por hora, nota de voz → texto → solicitud del catálogo → reporte → PDF → respuesta con resumen; aclaración con ejemplos si no entiende. Reportes: ventas (serie por sede), productos más vendidos e inventario frente al mínimo.
- Rutas `adapters/http/rutas/asistente.ts`: webhook GET/POST con firma, prueba desde el admin, estado de la integración y descarga directa de PDF.
- Web: `/admin/asistente` (probador, estado, descargas).
- Pruebas: 7 unitarias del intérprete + 11 de integración (firma, lista blanca, idempotencia, voz, aclaración, permisos, PDF válido). **Total 127 en verde.** E2E del probador con descarga del PDF.

## Cierre — qué quedó

- **Seguridad**: contraseñas con HMAC-SHA256 (pimienta) + bcrypt 12 en formato `v2$` (bcrypt ignoraba lo que pasa de 72 bytes) con actualización transparente de los hashes antiguos al ingresar; `Cache-Control: no-store` por defecto en la API; el proxy de la web rechaza `.`/`..`; Zod `jitless` en el navegador (la CSP sin `unsafe-eval` ya no reporta violaciones); la página ya no se recarga sola cuando el service worker se instala por primera vez.
- **Dependencias**: `pnpm audit --prod` sin vulnerabilidades (2 moderadas solo de desarrollo).
- **Lighthouse móvil** (build de producción): rendimiento 92–99 y 100 en accesibilidad, buenas prácticas y SEO en las 7 páginas públicas. Para llegar: menú prerenderizado en el servidor, Motion fuera de las pantallas de entrada (animaciones CSS con `usePresencia`), fuentes recortadas, Zod solo donde se valida, enlaces sin prefetch, tarjetas memorizadas, service worker después de `load`, contraste AA y nombres accesibles. Ver D60–D69.
- **PWA**: instalable sin errores en Chromium; portada y menú precargados para funcionar sin conexión desde la primera visita.
- **Docker**: imágenes reconstruidas y probadas en modo producción (API ~455 MB, web ~393 MB).
- **Pruebas**: 130 de la API y 7 e2e en navegador contra el build de producción (la de cocina ahora crea su propio pedido).
- **Informe final** en [INFORME.md](INFORME.md).

## Fase 9 — módulo de mesero

- **Modelo**: tablas `mesas` y `cuentas_mesa` (migración `0002_mesas`). Cada ronda es un pedido de canal `mesa` con su cuenta y número de ronda; una restricción en la base separa los datos de domicilio de los de mesa. Los pagos pueden ser de un pedido o de una cuenta.
- **API**: `application/mesas.ts` (salón, abrir, detalle, personas y «pedir la cuenta», liberar, cobro dividido con propina, mesas del admin) y `crearRonda` en `application/pedidos.ts` (misma transacción con bloqueo y descuento por receta que un domicilio, con idempotencia). Transiciones por canal en `domain/permisos.ts` (en la mesa: la cocina prepara, el mesero sirve, no hay «en camino»). Sala de tiempo real `mesas:<sede>` solo para rondas y cuentas.
- **Web**: `/mesero` (salón por zonas con colores y texto por estado, «Listo para servir» con sonido y vibración, «Mis mesas», abrir mesa) y `/mesero/cuenta/[id]` (menú por categorías, borrador con notas y cantidades, envío a la cocina, rondas con estado, «Ya lo serví», cancelar en cola, pedir la cuenta, liberar). En cocina, cada tarjeta dice si es domicilio o «Mesa N · zona · ronda». En caja, pestaña **Mesas** con el cobro (pagos divididos, partes iguales, efectivo con cambio, QR y propina voluntaria). En admin, **Sedes › Mesas**.
- **Pruebas**: 11 de integración (flujo completo con descuento exacto por receta, permisos por rol y sede, idempotencia, stock insuficiente, cancelaciones, reportes, tiempo real sin datos de domicilio) y 5 unitarias. **Total 146 en verde.** E2E: el mesero abre la mesa, envía la ronda, la recibe lista en vivo, la sirve y la caja cobra la cuenta dividida (8 e2e en verde).
- **Además**: contraste AA en los chips del personal y límite de ingresos configurable solo fuera de producción (para la suite e2e).

## Fase 10 — lote 2

- **Propina**: 0 o el 10 % exacto del consumo, redondeado a la centena (la mitad sube). La regla está en `packages/shared/src/reglas.ts`: la caja la muestra y la API rechaza cualquier otro valor (D91).
- **Turnos** (migración `0003_turnos`): entrada y salida desde la barra del personal (un turno abierto por persona), y en `/admin/turnos` los turnos y las horas por persona y sede, con cierre de un turno olvidado y aviso de los de más de 16 h (D87).
- **Plano** (migración `0004_plano_mesas`): cuadrícula por zona con posición, tamaño y forma de cada mesa, y validación de límites y choques en `domain/plano.ts`. En `/admin/sedes` está el editor por toques; el salón del mesero tiene vista de plano o de lista (D83, D84).
- **Trasladar, juntar y separar** (migración `0005_juntar_mesas`): con bloqueo, auditoría y aviso en vivo; las rondas y pagos de una cuenta fundida pasan a la principal, que la caja cobra como una sola (D85, D86, D92). Arreglo: el salón se refresca solo después de liberar o mover una mesa.
- **Pasaporte de sellos** (migración `0006_pasaporte`): `/pasaporte` para el cliente (inscripción, tarjeta, código, historial y salida con borrado), sello y canje en la caja (el premio entra como ronda de precio 0), sello automático en los domicilios pagados y `/admin/pasaporte` para la configuración. Ley 1581 y aviso de privacidad actualizados (D88–D90).
- **Seed**: mesas ubicadas en el plano, un mesero en Normandía, mesas ocupadas, turnos de la semana y el Pasaporte con la clienta de prueba (D94).
- **Pruebas**: 18 nuevas de la API (turnos, plano, mover y juntar, propina y 8 del Pasaporte) y 3 e2e nuevas (mover y juntar mesas, turnos y Pasaporte). Total: **164 de la API y 11 e2e** al cerrar el lote.

## Fase 11 — despliegue (Supabase, Railway y Vercel)

- **Conexión** (`adapters/db/cliente.ts`): TLS con certificado opcional (`DATABASE_SSL_CA`), limpieza de `sslmode` en la URL, `statement_timeout` con `SET` al abrir cada conexión (Supavisor ignoraba el parámetro de arranque), manejo de errores de conexiones inactivas y `DATABASE_POOL_MAX` (D96–D99).
- **Arranque sin consola** (`src/arranque.ts`): `SEED_AL_INICIAR` (solo con la base vacía, con candado y confirmación en producción) y `ADMIN_INICIAL_CORREO` (invitación de 2 horas, sin repetir). El seed se separó de su script (`sembrar-cli.ts`) y va en `dist/seed.js` (D101, D102).
- **Railway**: `apps/api/railway.json` se queda (migraciones en el `preDeployCommand`), `TRUST_PROXY_HOPS=1` verificado con pruebas, heap de Node acotado en la imagen (D100, D103, D104). Se quitó `apps/web/railway.json`.
- **Vercel**: las pantallas de acceso solo muestran Google o Apple si la API tiene sus credenciales (D105). Build verificado en un clon limpio con Node 24, Root Directory `apps/web` y pnpm 11 por Corepack (D106).
- **Verificación con el pooler real de Supabase** (Supavisor 2.9.13 en Docker, modo sesión y TLS): conexión cifrada con y sin verificación (con una CA equivocada falla), URL con `sslmode=require`, migraciones de Drizzle, **la suite completa de la API (183 pruebas)**, el build de producción arrancando con el seed y el inicio de sesión del admin de prueba, la invitación del primer admin en una base vacía y que reiniciar no la repita.
- **Memoria de la API** (imagen Docker, contra el pooler): 83 MB en reposo y 141 MB con 1.000 solicitudes por segundo; sin el límite eran 209 y 740 MB (D104).
- **Pruebas**: 19 nuevas (conexión, variables, arranque e IP detrás del proxy de Railway). **Total: 183 de la API.**
- **Arreglos que salieron al verificar**: los Dockerfiles ya no usan cachés de BuildKit, que Railway rechaza (D110), y `pnpm test` de la web ya no intenta correr las e2e con Vitest, algo que habría tumbado el CI (D111).
- **CI en un clon limpio con Node 24** (contenedor `node:24-bookworm-slim`): `pnpm install --frozen-lockfile`, `pnpm typecheck`, lint de la web, `pnpm test`, `pnpm build` y `pnpm audit --audit-level high --prod`, todo en verde. E2E: 11 en verde contra el build de producción. Lighthouse móvil: entre 90 y 98 en rendimiento y 100 en lo demás, en las ocho páginas públicas.

## Siguiente paso exacto

**Todo listo para desplegar; no hice `git push`.** Daniel revisa y sube los commits. Luego configura Supabase, Railway y Vercel desde la tableta, siguiendo el [README](README.md#desplegar) (variables exactas por servicio y lista para antes de abrir al público). Después: MFA para el personal y el administrador, monitoreo, repetir Lighthouse con la URL real y definir el reparto de la propina.

## Cómo verificar lo hecho

```bash
pnpm db:up && pnpm db:reset
pnpm --filter @rejana/api test     # pruebas unitarias + integración
CHROMIUM_PATH=/usr/bin/chromium pnpm --filter @rejana/web e2e   # con la app corriendo (pnpm dev, con LIMITE_INGRESOS_POR_MINUTO=60 en .env; o E2E_URL=… contra un build)
pnpm dev                           # http://localhost:3000 y http://localhost:4000/api/salud
```

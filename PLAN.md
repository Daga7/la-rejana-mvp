# Plan del MVP — La Rejana Callejera

PWA de domicilios + módulos de operación (cocina, caja, domiciliario, admin) para las 2 sedes de La Rejana Callejera en Bogotá.

## 1. Arquitectura

```
rejanamvp/                      monorepo pnpm
├─ apps/
│  ├─ web/                      Next.js 16 (App Router) + TS + Tailwind 4 · PWA
│  │  ├─ src/app/api/[...ruta]  Proxy same-origin hacia la API (cookies first-party, IP real, secreto compartido)
│  │  ├─ public/sw.js           Service worker propio (caché, offline, Web Push)
│  │  └─ src/…                  Pantallas: cliente, cocina, caja, domiciliario, admin, buzón
│  └─ api/                      Node + TS · Fastify 5 · arquitectura hexagonal
│     └─ src/
│        ├─ domain/             Entidades y reglas puras (pedido, inventario, rutas, permisos, reportes)
│        ├─ application/        Casos de uso (reciben un "actor" y aplican permisos rol + sede)
│        ├─ ports/              Interfaces: repositorios, correo, push, mapas, WhatsApp, IA, STT, PDF, OAuth, eventos, pagos
│        ├─ adapters/           http (Fastify), db (Drizzle + PostgreSQL), realtime (Socket.IO), proveedores reales + mocks
│        └─ main.ts             Raíz de composición: elige adaptador real o mock según variables de entorno
├─ packages/shared/             Esquemas Zod, enums y utilidades compartidas (validación idéntica en front y back)
└─ docker-compose.yml           PostgreSQL 17 (puerto 5433) + Mailpit (correo de desarrollo)
```

Flujo de red:

```
Navegador ──HTTPS──▶ web (Next.js) ──/api/* proxy──▶ api (Fastify) ──▶ PostgreSQL
    │                                                    ▲
    └──────── WebSocket (Socket.IO, ticket JWT corto) ───┘
Meta WhatsApp ──webhook firmado──▶ api
```

- El navegador **solo habla con el dominio del frontend** para REST: las cookies de sesión son de primera parte (`SameSite=Lax/Strict`, `httpOnly`, `Secure`) aunque web y API estén en dominios distintos (Vercel + Railway).
- El WebSocket va directo a la API con un **ticket** de 2 minutos emitido por REST (no depende de cookies de terceros).

## 2. Fases (orden de prioridad; cada una termina funcionando y con commit)

| # | Fase | Entregable verificable |
|---|------|------------------------|
| 1 | Base | Monorepo, esqueleto hexagonal, Docker Compose, migraciones + seed, Next.js PWA instalable con tema de marca, proxy `/api`, Dockerfiles, `railway.json`, CI, `.env.example` |
| 2 | Autenticación | Invitado, registro con código de 6 dígitos (10 min, 5 intentos, reenvío limitado), login correo/clave con bloqueo, Google y Apple (OAuth + mock), refresh rotativo con detección de reuso, invitaciones de empleados, recuperar/cambiar clave, CSRF, rate limiting, tests |
| 3 | Menú, recetas, inventario | Menú por sede, recetas por producto, inventario por insumo y sede, cálculo de unidades preparables, agotado automático, alertas de stock bajo, tests de descuento |
| 4 | Pedidos a domicilio | Carrito, checkout con mapa, pago efectivo/QR, idempotencia, máquina de estados, descuento/reposición de insumos, Web Push (VAPID), seguimiento en vivo |
| 5 | Domiciliario | Pedidos asignados, ruta óptima con límite de minutos (y sugerencia de dividir salidas), ubicación en tiempo real con ETA, Google Maps/Waze |
| 6 | Cocina, caja, admin | Tablero de cocina en tiempo real, caja (asignar, cobrar, cerrar), admin (CRUD sedes/productos/recetas/insumos/inventario/empleados, tablero de ventas, auditoría) |
| 7 | Buzón | Quejas/sugerencias de empleados con opción anónima real (sin rastro del autor) |
| 8 | WhatsApp + PDF | Webhook firmado, lista blanca de admins, nota de voz → STT → IA → catálogo cerrado de reportes → PDF con gráficas → respuesta por el chat |
| — | Cierre | Revisión de seguridad, `pnpm audit`, Lighthouse, `INFORME.md` |

## 3. Modelo de datos (PostgreSQL)

Convenciones: `uuid` como PK (`gen_random_uuid()`), dinero en **pesos enteros (COP)**, cantidades de insumo en unidad base (`g`, `ml`, `und`) con `numeric(14,3)`, fechas `timestamptz` y reportes calculados en `America/Bogota`.

### Sedes y usuarios
- **sedes**: id, slug, nombre, direccion, barrio, telefono, lat, lng, hora_apertura, hora_cierre, tarifa_domicilio, limite_minutos_entrega (25), minutos_preparacion (20), qr_pago_url, qr_pago_instrucciones, activa, timestamps.
- **usuarios**: id, email (único, normalizado), nombre, telefono (E.164), password_hash (null si solo OAuth), email_verificado_en, rol (`cliente|mesero|cocina|caja|domiciliario|admin`), sede_id (obligatoria para empleados), activo, intentos_fallidos, bloqueado_hasta, acepto_privacidad_en, version_privacidad, whatsapp_habilitado (lista blanca del asistente), ultimo_ingreso_en, credenciales_cambiadas_en, timestamps.
- **identidades_oauth**: id, usuario_id, proveedor (`google|apple`), sujeto, email · único (proveedor, sujeto).
- **sesiones**: id, usuario_id, ip, user_agent, expira_en (máximo absoluto), revocada_en, motivo_revocacion, ultimo_uso_en.
- **tokens_refresco**: id, sesion_id, token_hash (único), expira_en, usado_en · rotación con detección de reuso (reuso ⇒ se revoca la sesión entera).
- **codigos_verificacion**: id, email, proposito (`verificar_correo|recuperar_clave`), codigo_hash (HMAC), intentos, expira_en, consumido_en.
- **invitaciones**: id, email, rol, sede_id, token_hash, invitado_por, expira_en, aceptada_en, revocada_en, usuario_id.
- **direcciones_cliente**: id, usuario_id, etiqueta, direccion, detalle, barrio, lat, lng.

### Menú, recetas e inventario
- **categorias**: id, nombre, slug, orden, activa (seed: Hamburguesas, Choriperros).
- **productos**: id, categoria_id, nombre, slug, descripcion, imagen_url, activo.
- **menu_sede**: (sede_id, producto_id) PK, precio, disponible (interruptor manual), orden ⇒ menú y precio **por sede**.
- **insumos**: id, nombre, unidad (`g|ml|und`), activo.
- **receta_items**: (producto_id, insumo_id) PK, cantidad.
- **inventario**: (sede_id, insumo_id) PK, cantidad (≥ 0), stock_minimo (alerta configurable).
- **movimientos_inventario**: id, sede_id, insumo_id, tipo (`consumo_pedido|reposicion_cancelacion|ajuste_manual|entrada`), cantidad (con signo), saldo_resultante, pedido_id, usuario_id, nota.

Un producto está **agotado** si su interruptor está apagado o si `min(floor(stock_insumo / cantidad_receta)) < 1` para alguno de sus insumos en esa sede.

### Pedidos y domicilios
- **pedidos**: id, numero (secuencia), sede_id, canal (`domicilio`), cliente_id (null = invitado), estado (`recibido → en_preparacion → listo → en_camino → entregado`, o `cancelado`), contacto_nombre, contacto_telefono, direccion, direccion_detalle, barrio, lat, lng, notas, metodo_pago (`efectivo|qr`), paga_con, subtotal, costo_envio, total, estado_pago (`pendiente|pagado`), domiciliario_id, recorrido_id, token_seguimiento_hash (invitados), clave_idempotencia, motivo_cancelacion, timestamps de cada hito, cerrado_en, cerrado_por.
- **pedido_items**: id, pedido_id, producto_id, nombre y precio_unitario (copias históricas), cantidad, notas, subtotal.
- **pedido_eventos**: id, pedido_id, estado, actor_id, actor_rol, nota, creado_en (historial).
- **pagos**: id, pedido_id, metodo, monto, recibido, cambio, referencia, registrado_por.
- **recorridos**: id, sede_id, domiciliario_id, estado (`activo|finalizado`), orden_paradas (jsonb), ultima_lat/lng/ubicacion_en (se borran al finalizar), iniciado_en, finalizado_en.
- **suscripciones_push**: id, endpoint (único), p256dh, auth, usuario_id (null = invitado) · **pedido_suscripciones** (pedido_id, suscripcion_id).

### Operación y gobierno
- **buzon_mensajes**: id, tipo (`queja|sugerencia`), mensaje, anonimo, autor_id y sede_id (**null si es anónimo**), fecha (solo día si es anónimo), estado (`nueva|en_revision|resuelta`).
- **auditoria**: id, actor_id, actor_rol, accion, entidad, entidad_id, datos (jsonb antes/después), ip, creado_en.
- **whatsapp_mensajes**: wamid (PK, idempotencia de webhooks), telefono, tipo, estado, recibido_en, procesado_en.

## 4. API (resumen)

| Área | Endpoints |
|---|---|
| Auth | `POST /api/auth/registro`, `/verificar-correo`, `/reenviar-codigo`, `/ingresar`, `/refrescar`, `/salir`, `/cambiar-clave`, `/recuperar-clave`, `/restablecer-clave` · `GET /api/auth/yo` · `GET /api/auth/oauth/:proveedor` + callback |
| Invitaciones | `GET /api/invitaciones/:token`, `POST /api/invitaciones/:token/aceptar` |
| Menú | `GET /api/sedes`, `GET /api/sedes/:id/menu` |
| Pedidos | `POST /api/pedidos` (Idempotency-Key), `GET /api/pedidos/:id`, `POST /api/pedidos/:id/cancelar`, `GET /api/mis-pedidos` |
| Operación | `GET /api/operacion/pedidos`, `PATCH /api/pedidos/:id/estado`, `POST /api/pedidos/:id/asignar`, `/pagos`, `/cerrar` |
| Domiciliario | `GET /api/domiciliario/pedidos`, `POST /api/domiciliario/ruta`, `/recorridos`, `/recorridos/:id/finalizar`, `/ubicacion`, `POST /api/pedidos/:id/entregar` |
| Push / tiempo real | `GET /api/push/clave-publica`, `POST/DELETE /api/push/suscripciones`, `POST /api/realtime/ticket` |
| Admin | CRUD sedes, categorías, productos (+ receta y menú por sede), insumos, inventario (ajustes/entradas), empleados (invitar, rol, sede, activo), reportes, tablero, auditoría, buzón, asistente |
| Buzón | `POST /api/buzon` |
| WhatsApp | `GET/POST /api/webhooks/whatsapp` (verificación + firma `X-Hub-Signature-256`) |

## 5. Seguridad (OWASP ASVS L2 / Top 10)

bcrypt costo 12 · JWT de acceso 15 min ligado a una sesión revocable · refresh opaco rotativo con detección de reuso · cookies `httpOnly`+`Secure`+`SameSite` (prefijo `__Host-` en producción) · CSRF doble envío + verificación de `Origin` · Zod en todas las entradas · Drizzle (consultas parametrizadas) · rate limiting por IP real + bloqueo por cuenta · Helmet + CSP estricta con nonce + HSTS · CORS restringido · firma de webhooks · permisos rol + sede en cada caso de uso (tests) · auditoría de acciones admin · secretos solo por entorno · aviso de privacidad Ley 1581 con aceptación.

## 6. Pruebas

- Unitarias (dominio): máquina de estados, cálculo de capacidad por receta, optimizador de rutas, políticas de permisos, intérprete de reportes por reglas.
- Integración (PostgreSQL real + `fastify.inject`): registro/verificación/login/bloqueo/rotación/reuso, permisos por rol y sede, descuento y reposición de inventario, concurrencia sin sobreventa, buzón anónimo, webhook firmado.

## 7. Despliegue

- **Railway**: servicio `api` (Dockerfile, `preDeployCommand` = migraciones) + PostgreSQL gestionado; servicio `web` (Dockerfile standalone) **o** Vercel (raíz `apps/web`).
- Variables documentadas en `.env.example`. Sin credenciales se usan adaptadores mock (correo a consola/Mailpit, push a consola, WhatsApp a disco, IA por reglas).

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

## Autenticación (fase 2)

| # | Decisión | Por qué |
|---|----------|---------|
| D23 | La cuenta de cliente **solo se crea al verificar el código**; el registro pendiente (nombre + hash de la clave) vive junto al código, que queda **ligado al navegador** que lo pidió (cookie httpOnly). | Evita que alguien «aparte» un correo ajeno o gane una carrera fijando su contraseña en una cuenta que luego verifica el dueño. |
| D24 | Contraseñas según **OWASP ASVS 5.0 §6.2**: 8–128 caracteres, sin reglas de composición, lista local de claves comunes + consulta a **Have I Been Pwned** con k-anonimato (si el servicio falla, no bloquea). | Es lo que pide ASVS hoy; las reglas de composición empeoran la usabilidad sin mejorar la seguridad. |
| D25 | Token de acceso JWT de 15 min ligado a una **sesión revocable que se verifica en la BD en cada petición**; refresh opaco **rotativo** con detección de reuso (si reaparece un token usado, se revoca la sesión; 30 s de gracia para pestañas simultáneas). Vida por rol: cliente 30 días (14 de inactividad), personal 7 días (24 h), admin 7 días (12 h). | Revocación inmediata al salir, cambiar clave o desactivar a un empleado; el personal maneja datos más sensibles. |
| D26 | Registro y recuperación responden **igual** exista o no el correo; los correos salen en segundo plano y el login con correo inexistente compara contra un hash ficticio. | Impide enumerar cuentas por la respuesta o por el tiempo. |
| D27 | CSRF: token en cookie httpOnly entregado por `GET /api/auth/csrf` (la web lo guarda en memoria y lo envía en `x-csrf-token`) + verificación de `Origin`/`Sec-Fetch-Site`; cookies `SameSite=Strict`. | Defensa en profundidad sin exponer el token a scripts vía `document.cookie`. |
| D28 | Enlaces de invitación con el token en el **fragmento** (`/invitacion#t=…`): no llega a servidores, logs ni `Referer`. 72 h, un solo uso y solo para ese correo (con Google/Apple se exige el mismo correo verificado). | Cumple el encargo y no deja el secreto en ningún log. |
| D29 | Con Google/Apple, la cuenta nueva acepta el aviso de privacidad por **conducta inequívoca** (texto visible junto al botón; Decreto 1377 de 2013, art. 7) y se vincula por correo verificado del proveedor. | Flujo de un toque sin saltarse la autorización de la Ley 1581. |
| D30 | No se puede invitar como empleado un correo que ya tiene cuenta (de cliente u otra). | Simplicidad del MVP; el admin puede usar otro correo o cambiar el rol de un empleado existente. |
| D31 | Proveedor OAuth **simulado** (pantalla propia) solo con `OAUTH_MOCK=true` y nunca en producción (la API no arranca si se intenta). | Probar el flujo completo (state, nonce, callback, invitaciones) sin credenciales. |

## Pedidos, push y tiempo real (fase 4)

| # | Decisión | Por qué |
|---|----------|---------|
| D32 | El inventario se descuenta **al crear el pedido** (estado «recibido»), dentro de una transacción que bloquea las filas de los insumos (`SELECT … FOR UPDATE` en orden) y con un `CHECK cantidad >= 0` como última barrera. | Es el momento de «confirmar» del encargo y garantiza que dos pedidos simultáneos no vendan el mismo insumo (probado con 4 pedidos concurrentes). |
| D33 | Al cancelar: si la comida no se alcanzó a preparar (recibido/en preparación) los insumos vuelven; si ya estaba lista o en camino, por defecto **no** vuelven (se consumieron), salvo que la caja marque «reponer». El cliente solo cancela mientras está «recibido». | Refleja lo que pasa en la cocina sin falsear el inventario. |
| D34 | Precios, disponibilidad, cobertura (radio por sede) y horario se validan **siempre en el servidor**; el carrito solo envía ids y cantidades. Pedidos fuera de horario se rechazan (en desarrollo se permiten con `PERMITIR_PEDIDOS_FUERA_DE_HORARIO`). | El cliente no puede manipular precios ni pedir donde no se entrega. |
| D35 | **Idempotencia** del checkout con `Idempotency-Key` (UUID generado y guardado en el carrito): si la red falla y el cliente reintenta, recibe el mismo pedido. A un invitado se le emite un token de seguimiento nuevo en el reintento. | Conexiones inestables sin pedidos duplicados ni dobles descuentos. |
| D36 | Los invitados consultan su pedido con un **token de seguimiento** (32 bytes, guardado solo como HMAC) que vive en el dispositivo; sin token la API responde «no existe». | Seguimiento sin cuenta y sin exponer pedidos ajenos por id. |
| D37 | Web Push solo hacia **servicios push conocidos** (FCM, Mozilla, Apple, Windows). | La API hace un POST a la URL de la suscripción: sin lista blanca sería un vector de SSRF. |
| D38 | «Pagado» y «cerrado» son independientes del estado de entrega: la caja registra pagos (efectivo con cambio o QR con referencia) y cierra el pedido entregado y pagado. | El flujo de caja no se mezcla con la logística. |
| D39 | La web local carga el `.env` raíz con un lanzador propio (`scripts/next-con-env.mjs`) en lugar de `--env-file`. | Next propaga las banderas de Node a sus workers (no permitido en `NODE_OPTIONS`) y el `NODE_ENV` del `.env` rompía el build. |
| D40 | Pruebas e2e con **Playwright** usando el Chromium del sistema (`CHROMIUM_PATH`), sin descargar navegadores. | Verificar los flujos reales en un navegador (incluido el tiempo real) sin dependencias pesadas. |

## Domiciliario (fase 5)

| # | Decisión | Por qué |
|---|----------|---------|
| D41 | «Tiempo total» = minutos hasta la **última entrega** de la salida (sin contar el regreso). Como las llegadas crecen a lo largo de la ruta, cumplir el límite equivale a que la última llegue a tiempo. Se resuelve exacto (Held-Karp) y, si no cabe, se busca el **menor número de salidas** factibles (DP sobre subconjuntos). Máximo 10 pedidos por plan. | Exacto y en milisegundos para el tamaño real de una salida en moto; cumple «sugerir dividir en dos salidas» y lo generaliza si hiciera falta. |
| D42 | Tiempos de viaje por el puerto `MatrizTiempos`: por defecto distancia en línea recta × 1,35 a 22 km/h (sin costo ni llaves); OSRM o Google Distance Matrix con una variable. 3 min de servicio por parada. | Funciona desde el primer día y mejora con tráfico real cuando haya llave de Google. |
| D43 | Ubicación del domiciliario por **WebSocket con confirmación** (respaldo REST), máximo una cada 2 s en el servidor (cada 5 s desde el celular). Solo se acepta con recorrido activo y solo se emite a las salas de los pedidos de ese recorrido que siguen «en camino». Se guarda la última posición cada 15 s y se **borra al terminar** el recorrido. | Privacidad del encargo y minimización de datos (Ley 1581). |
| D44 | ETA por parada recalculado con el proveedor de mapas cada 30 s y descontando el tiempo transcurrido entre cálculos. | Evita llamadas excesivas a servicios de pago. |
| D45 | Un domiciliario tiene como máximo un recorrido activo (índice único parcial); al entregar el último pedido el recorrido termina solo. Waze se abre con la siguiente parada (Waze no admite varias); Google Maps con toda la ruta. | Reglas simples para la operación diaria. |
| D46 | La pantalla del domiciliario pide **Wake Lock** (pantalla encendida) durante el recorrido. | Si el teléfono se bloquea, el navegador deja de enviar la ubicación. |

## Cocina, caja y administración (fase 6)

| # | Decisión | Por qué |
|---|----------|---------|
| D47 | Gráficas propias en SVG (sin librería), siguiendo la guía de visualización: paleta de **colores de marca validada con el script** (azul `#2156d8`, rosa `#e8237d`, naranja `#c95f06`: pasan todas las verificaciones, incluso por todos los pares, sobre la superficie crema), color por entidad en orden fijo, un solo eje, trazo de 2 px, leyenda + etiquetas directas, crosshair con tooltip de todas las series, navegación con teclado y **vista de tabla** en cada gráfica. Barras de una sola serie en un solo tono. Alertas con la paleta de estado reservada + ícono + texto. | Gráficas legibles para daltónicos, accesibles y livianas (sin dependencias). Las tarjetas son crema en toda la app, por eso solo hay modo claro. |
| D48 | «Ventas» = total de los pedidos **no cancelados** por fecha de creación (hora de Bogotá), incluye el domicilio. La variación del mes compara con **los mismos días** del mes anterior. | Comparación justa a mitad de mes; el día en curso se señala como parcial. |
| D49 | El admin opera cocina y caja de cualquier sede (selector recordado en el dispositivo); el resto del personal, solo la suya. | Cubre el caso real del dueño que supervisa ambas sedes. |
| D50 | Al cambiar rol, sede o estado de un empleado se **cierran sus sesiones** al instante; siempre queda un admin activo; nadie se desactiva a sí mismo; el asistente de WhatsApp solo se habilita a admins con celular. | Los permisos nuevos aplican de inmediato y no hay forma de quedarse sin administrador. |
| D51 | La cocina usa actualización **optimista** (la tarjeta se mueve al tocar y vuelve si la API falla) y campana generada con Web Audio, que el navegador solo permite tras un toque («Activar sonido»). | Respuesta inmediata en la tablet de cocina sin archivos de audio. |

## Buzón (fase 7)

| # | Decisión | Por qué |
|---|----------|---------|
| D52 | Mensaje anónimo = sin autor, sin sede y **sin hora** (solo la fecha); id aleatorio (UUID v4) y listado ordenado por fecha, no por orden de llegada; no se audita el envío, el endpoint no deja ni la línea de acceso en los logs y el límite de envíos vive solo en memoria. Un `CHECK` en la BD impide guardar un anónimo con autor. | «No guardes en la base de datos nada que identifique al autor»: en un equipo pequeño, la sede o la hora bastarían para adivinar quién fue. |
| D53 | El formulario arranca en **anónimo** y explica qué se guarda en cada caso. | Que sea la opción segura por defecto y que la persona decida informada. |

## Asistente de WhatsApp (fase 8)

| # | Decisión | Por qué |
|---|----------|---------|
| D54 | La IA solo **clasifica**: convierte el mensaje en una solicitud de un **catálogo cerrado** (ventas, productos más vendidos, inventario + sede + periodo + insumo) que se valida con Zod; los datos salen de consultas fijas y parametrizadas. Nunca hay SQL generado por la IA y el prompt ignora instrucciones incrustadas. | Requisito del encargo y defensa contra inyección de instrucciones. |
| D55 | Intérprete con **Claude `claude-opus-5-5`** (modelo por defecto según la guía vigente de la API; configurable con `ANTHROPIC_MODEL`, por ejemplo `claude-haiku-5-5` si el negocio prefiere menor costo) usando **salidas estructuradas** (`messages.parse` + esquema Zod) con esfuerzo `low`, `fallbacks: "default"` del servidor ante rechazos, timeout de 25 s y 1 reintento. Si la API falla, responde el **intérprete por reglas**, que también es el modo sin credenciales. | En Opus 5.5 el `tool_choice` forzado devuelve 400; las salidas estructuradas garantizan el JSON. La clasificación no necesita esfuerzo alto. |
| D56 | Transcripción con cualquier API compatible con `/audio/transcriptions` (OpenAI por defecto, `gpt-4o-mini-transcribe`; Groq u otra cambiando `STT_BASE_URL`). La API de Claude no transcribe audio. | Las notas de voz de WhatsApp (OGG/Opus) se envían tal cual, sin convertir. |
| D57 | Webhook: firma `X-Hub-Signature-256` verificada sobre el **cuerpo crudo** en tiempo constante, respuesta 200 inmediata y procesamiento en segundo plano, **idempotencia por `wamid`**, lista blanca = admins activos con WhatsApp habilitado (los números desconocidos se ignoran sin responder ni guardar nada), límite de 20 reportes por hora por número y descarga de audio solo desde dominios de Meta. | Meta reintenta los webhooks; se evita SSRF, duplicados, abuso y costos. |
| D58 | PDF con **pdfkit** (vectorial, sin navegador) y las fuentes de la marca incrustadas (Poppins y Lora, licencia OFL incluida). Las gráficas usan la misma paleta validada del tablero; un periodo de un solo día no lleva gráfica (sería una barra sola) sino tabla por sede. | Imagen Docker liviana y reportes con la identidad del restaurante. |
| D59 | El admin puede **probar el asistente y descargar los PDF** desde `/admin/asistente`, con el mismo flujo que WhatsApp. | Permite usar y validar los reportes antes de tener la cuenta de Meta. |

## Cierre: revisión de seguridad

| # | Decisión | Por qué |
|---|----------|---------|
| D60 | Contraseñas: **HMAC-SHA256 con la pimienta del servidor → bcrypt costo 12**, guardado con el prefijo `v2$`. Los hashes sin prefijo se siguen aceptando y se recalculan solos en el siguiente inicio de sesión. | bcrypt ignora lo que pasa de 72 bytes (frases largas con tildes llegan rápido); el HMAC además impide el *password shucking*. **Consecuencia:** `TOKENS_PEPPER` no se puede cambiar sin obligar a todos a restablecer su contraseña. |
| D61 | Toda respuesta de la API lleva `Cache-Control: no-store` salvo que la ruta diga otra cosa; el service worker solo guarda datos públicos (sedes y menú). | ASVS (protección de datos en el cliente): que los datos personales no queden en cachés del navegador ni intermedias. |
| D62 | El proxy `/api/*` de la web rechaza segmentos `.` y `..`. | Que desde internet solo se alcancen rutas bajo `/api` de la API. |

## Cierre: Lighthouse móvil, accesibilidad y PWA

| # | Decisión | Por qué |
|---|----------|---------|
| D63 | **Motion solo donde aporta** (carrito, seguimiento del pedido y módulos del personal), con `LazyMotion` + `m` + `domAnimation`. Las pantallas de entrada (portada, menú, ingreso, registro, recuperación) usan **animaciones CSS** equivalentes; las salidas se conservan con el hook `usePresencia`. Se quitaron las animaciones de layout (cocina, avisos). | Motion 14 suma ~45 KB gzip en cada página (Turbopack no recorta su código de proyección) y era lo que más pesaba en el LCP simulado del celular. Las animaciones CSS respetan `prefers-reduced-motion` con la regla global. |
| D64 | El **menú se renderiza en el servidor** (sedes + menú de la primera sede abierta, como `fallback` de SWR). En la primera carga SWR no los vuelve a pedir; al volver navegando dentro de la app sí revalida, y el refresco cada 60 s sigue igual. Durante la hidratación se usa la sede por defecto y luego la del carrito guardado. | El menú se ve sin esperar el JavaScript ni dos idas a la API (clave con 3G/4G lento) y se evitan renders repetidos. |
| D65 | Enlaces de la navegación del cliente y de las pantallas de cuenta **sin prefetch**. | Las páginas son dinámicas (CSP con nonce): el prefetch casi no adelanta nada y compite con la carga inicial en el celular. |
| D66 | Fuentes: solo los pesos que se usan (Poppins 400/600/700/800/900 y Lora 700 cursiva). | Cada peso es un archivo que se precarga en todas las páginas (bajó de 90 KB a 62 KB). |
| D67 | **Zod en modo `jitless` en el navegador** y `@rejana/shared` declara `sideEffects`. | Con la CSP sin `unsafe-eval`, Zod probaba `new Function` y el navegador lo reportaba como violación; además, Zod ya no se descarga en las páginas que no validan formularios. |
| D68 | El service worker se registra **después del evento `load`**, precarga `/` y `/menu`, y la página solo se recarga cuando la persona toca «Actualizar» (antes también se recargaba sola en la primera instalación). | Que la instalación no compita con la carga, que portada y menú funcionen sin conexión desde la primera visita y no interrumpir a quien está llenando el checkout. |
| D69 | Colores con texto blanco o sobre fondos claros pasan **AA (≥ 4,5:1)** con los tonos `rosa-500`, `rojo-500` y `naranja-700`; el nombre accesible de las tarjetas de producto es su contenido visible (WCAG 2.5.3). | Lighthouse marcaba contraste insuficiente y «label in name». |

## Fase 9: módulo de mesero (después del MVP)

Referencia de flujos: el módulo de mesero del demo (`apps/mesero`): salón, abrir mesa con personas, rondas a la cocina, «ya lo serví», pedir la cuenta y cobro en la caja.

| # | Decisión | Por qué |
|---|----------|---------|
| D70 | Cada **ronda** que el mesero envía es un **pedido de canal `mesa`** que pertenece a una **cuenta de mesa** (`cuentas_mesa`). Una restricción en la base exige los datos de entrega solo a los domicilios y la cuenta y la ronda solo a las mesas. En TypeScript, `PedidoDTO` es una unión por canal. | La cocina, el descuento de inventario por receta (con bloqueo de insumos), la cancelación con reposición, el tiempo real y los reportes ya estaban probados para pedidos: se reutilizan sin duplicar lógica. |
| D71 | El mesero solo ve el **salón de su sede**: nunca los domicilios ni los datos de sus clientes. Recibe el tiempo real por una sala propia (`mesas:<sede>`) que solo transmite rondas y cuentas de mesa. Cualquier mesero de la sede puede atender cualquier mesa (el equipo se cubre); «Mis mesas» muestra las que abrió cada uno. El admin también puede operar el salón. | Permiso mínimo (el mesero no necesita direcciones ni teléfonos de clientes) y flujo real de un restaurante. |
| D72 | Flujo de la ronda: la **cocina** la prepara (en cola → en la parrilla → lista) y el **mesero la sirve** (`listo → entregado`, que en la mesa se muestra como «Servida»); en la mesa no existe «en camino». El mesero puede cancelar su ronda solo mientras está **en cola** (los insumos siempre vuelven); después, la caja o el admin, que deciden si se reponen. | Corrige errores del mesero sin dejarle deshacer trabajo de la cocina. |
| D73 | **Cobro de la mesa en un solo paso desde la caja**: exige que no quede ninguna ronda sin servir, acepta **hasta 6 pagos** (cuenta dividida, con botón de partes iguales; efectivo con cambio o QR con referencia) que deben sumar exactamente el consumo más la propina, y cierra la cuenta y todas sus rondas. | Evita cuentas a medio pagar y descuadres; dividir la cuenta es lo normal en una mesa. |
| D74 | **Propina voluntaria** sugerida del 10 %, que la caja solo agrega si la mesa acepta. Se guarda en la cuenta y **no cuenta como venta** en los reportes. | La propina en Colombia es voluntaria y se le debe preguntar al cliente; no es ingreso del restaurante. Su reparto entre el personal queda por definir (PENDIENTES). |
| D75 | Abrir una mesa que ya está abierta devuelve **la misma cuenta** (índice único parcial: una cuenta abierta por mesa). Las rondas llevan `Idempotency-Key` por borrador: si la señal falla y el mesero reintenta, la cocina no recibe la ronda dos veces. | Dos meseros tocando la misma mesa o un celular con mala señal no duplican nada. |
| D76 | Las rondas de mesa **no dependen del horario de domicilios** (el personal está en el local), pero una sede inactiva no recibe rondas. Si la mesa pidió la cuenta y sigue pidiendo, la nueva ronda la saca de «por cobrar». | Reglas simples y coherentes con la operación en el local. |
| D77 | En los reportes, una mesa con varias rondas cuenta como **un solo pedido** (`count(distinct coalesce(cuenta_id, id))`); las ventas suman domicilios y mesas. | El ticket promedio y el número de pedidos no se inflan por las rondas. |
| D78 | Las mesas las administra el admin por sede (número, zona del salón, puestos, en servicio). Una mesa con cuenta abierta no se puede sacar de servicio. Seed: Villaluz con 10 mesas (Salón y Terraza) y Normandía con 8 (primer y segundo piso), un mesero por sede y, solo en la demo, tres mesas ocupadas en Villaluz. | Datos realistas para probar sin afectar las pruebas, que parten del inventario inicial. |
| D79 | El borrador de cada mesa se guarda en `sessionStorage` (como en el demo) y **no hay aviso por cada producto agregado**: el contador del borrador rebota. | En las pruebas en el celular, los avisos apilados tapaban el botón «Enviar a la cocina». |
| D80 | Quedan fuera por ahora (sí estaban en el demo): plano con la posición de cada mesa, trasladar o juntar mesas, turnos con hora de entrada y salida, ingreso por PIN y pasaporte de sellos. | Alcance del módulo pedido. Están en PENDIENTES como siguientes pasos posibles. |
| D81 | El límite de inicios de sesión (10 por minuto e IP) se puede subir con `LIMITE_INGRESOS_POR_MINUTO` **solo fuera de producción**. | La suite e2e ya hace unos 10 ingresos por minuto desde la misma IP; en producción el límite es fijo. |
| D82 | Los chips de estado del personal (verde, turquesa y amarillo sobre fondos claros) usan tonos oscuros nuevos (`verde-700`, `turquesa-700`, `amarillo-800`) para pasar AA. | Estaban por debajo de 4,5:1; esas pantallas no las mide Lighthouse porque requieren sesión. |


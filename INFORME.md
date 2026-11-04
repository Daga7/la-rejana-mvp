# Informe final · MVP de La Rejana Callejera

Fecha: 4 de noviembre de 2026 · Rama `main`, sin subir a GitHub (no hice `git push`).

## En resumen

- El MVP está **completo y funcionando en local**: las 8 fases del plan, el cierre (seguridad, auditoría de dependencias, Lighthouse, Docker) y, después, el **módulo de mesero** que pediste. Cada fase quedó en su propio commit.
- **No está desplegado, así que no hay URL pública todavía.** Falta lo que solo tú puedes crear: el repositorio en GitHub y las cuentas de Railway (y Vercel, si quieres la web allá). Las imágenes Docker ya están construidas y probadas, y el paso a paso está en el [README](README.md#desplegar).
- Pruebas: **146 de la API** (unitarias + integración contra PostgreSQL real) y **8 de punta a punta en el navegador**, todas en verde.
- Lighthouse en celular, sobre el build de producción: **Rendimiento entre 92 y 99 y 100 en Accesibilidad, Buenas prácticas y SEO** en las siete páginas públicas. La app es instalable y funciona sin conexión.
- `pnpm audit --prod`: **0 vulnerabilidades**.
- Pendiente de seguridad más importante: **segundo factor (MFA) para el personal y el administrador** (ver [Riesgos](#riesgos-y-limitaciones)).

## Qué funciona

| Módulo | Qué hace hoy |
|---|---|
| Acceso | La pantalla de inicio tiene tres opciones: pedir como invitado, crear cuenta o ingresar. El registro usa un código de 6 dígitos por correo (vence en 10 min, máximo 5 intentos y reenvío limitado); la cuenta solo se crea al verificarlo. También hay recuperación de contraseña, Google y Apple (adaptadores reales más un selector simulado para desarrollo) e invitaciones de empleados de un solo uso, que vencen y sirven solo para ese correo. |
| Menú | Hamburguesas y choriperros con precio y disponibilidad por sede. Un producto se marca **agotado solo** cuando falta un insumo de su receta, y la tarjeta avisa «¡quedan N!». |
| Inventario | Recetas por producto con **descuento automático** al confirmar el pedido (en transacción y con bloqueo, así no se sobrevende), reposición si se cancela, entradas y conteos, capacidad por producto y alertas de stock bajo en vivo. |
| Pedidos | Checkout tipo Rappi: mapa con pin, ubicación del celular, direcciones guardadas, cobertura por sede, pago en efectivo (con «paga con») o QR del restaurante. Estados recibido → en preparación → listo → en camino → entregado (y cancelado). Notificaciones push (VAPID) y seguimiento en vivo. |
| Domiciliario | Ruta óptima (algoritmo exacto), límite de minutos configurable por sede, sugerencia de dividir en varias salidas y botones de Google Maps y Waze. Comparte su GPS en vivo **solo con el cliente de cada pedido y solo mientras va en camino**. |
| Cocina, caja y admin | Tablero de cocina en tres columnas, donde cada tarjeta dice si es domicilio o mesa. Caja con asignación de domiciliario, cobro con cambio, cierre y cancelación, y una pestaña de **mesas** para cobrarlas. El admin tiene tablero de ventas por sede, inventario, menú y recetas, sedes (con sus mesas), empleados y auditoría. |
| Buzón | Quejas y sugerencias del personal. Si son anónimas no se guarda nada que identifique a quien escribe, y la base de datos lo impide con una restricción. |
| Asistente de WhatsApp | Para administradores autorizados: entiende texto o notas de voz, convierte el pedido en un reporte de un **catálogo cerrado** (ventas, lo más vendido, inventario; nunca SQL libre) y responde con un **PDF con la marca y gráficas**. Si no entiende, pide aclaración. Desde `/admin/asistente` se puede probar sin la cuenta de Meta. |
| PWA | Se puede instalar, tiene íconos, splash y página sin conexión. La portada y el menú abren sin internet desde la primera visita. Hay aviso de versión nueva. |
| Mesero | Salón de su sede por zonas, con cada mesa pintada según su estado (libre, ocupada, lista para servir, pidió la cuenta). Abre la mesa con el número de personas y toma el pedido en el celular: menú por categorías, notas para la cocina y cantidades. Envía cada **ronda** a la cocina, con descuento de inventario por receta. Le llega en vivo lo que está listo (con sonido y vibración opcionales), marca «Ya lo serví», puede cancelar una ronda que la cocina aún no empieza y pide la cuenta. La **caja cobra la mesa**: puede dividir la cuenta en varios pagos (efectivo con cambio o QR) y agregar una propina voluntaria. El mesero nunca ve los domicilios ni los datos de los clientes. |

Quedan fuera del MVP, como pediste: pagos con tarjeta dentro de la app (el puerto para Wompi ya está listo), que el cliente pida desde la mesa (en el restaurante pide el mesero), facturación electrónica DIAN y apps nativas.

## Cómo lo verifiqué

- **API**: 146 pruebas en 15 archivos. Cubren lo crítico: registro, sesiones y bloqueos; permisos por **rol y sede** (cada rol solo ve su módulo y su sede); descuento de inventario por receta, también en las rondas de mesa; concurrencia sin sobreventa; idempotencia; privacidad del GPS; que el mesero no reciba datos de domicilios; firma del webhook y anonimato del buzón.
- **Navegador (Playwright, perfil Pixel 7)**: compra de un invitado con seguimiento en vivo, domiciliario y cliente en dos navegadores, cocina, caja, tablero del admin, buzón, asistente con descarga del PDF y el flujo completo del mesero (abrir la mesa, ronda a la cocina, servir en vivo y cobro dividido en la caja).
- **Lighthouse 12, celular (simulación de 4G lento y CPU 4× más lenta)**, build de producción en local:

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP | TBT |
|---|---|---|---|---|---|---|
| `/` (inicio) | 96–99 | 100 | 100 | 100 | 2,1–2,9 s | 40–50 ms |
| `/menu` | 94–95 | 100 | 100 | 100 | 3,0 s | 60–70 ms |
| `/carrito` | 92–94 | 100 | 100 | 100 | 3,1–3,2 s | 60–110 ms |
| `/ingresar` | 94 | 100 | 100 | 100 | 2,8–2,9 s | 140–150 ms |
| `/registro` | 93–97 | 100 | 100 | 100 | 2,3–2,8 s | 150–200 ms |
| `/recuperar` | 96–97 | 100 | 100 | 100 | 2,3 s | 150–180 ms |
| `/privacidad` | 97–99 | 100 | 100 | 100 | 2,1–2,4 s | 70–80 ms |

  Son dos corridas por página; el puntaje varía unos puntos entre corridas. Al empezar el cierre, el menú estaba en 81 y la portada en 88. Después de agregar el módulo de mesero lo repetí: portada 95, menú 93 e ingreso 97.

  Lighthouse 12 ya no tiene la categoría PWA. Por eso revisé la instalación directamente en Chromium: **sin errores de instalabilidad**, manifiesto sin errores, íconos normales y *maskable*. También apagué el servidor y comprobé que portada y menú abren desde la caché y que lo demás muestra la página «Sin señal».

  Las pantallas del personal no entran en la tabla porque requieren sesión. Usan mapas y animaciones más pesadas, y no las optimicé para Lighthouse.

## Seguridad (OWASP ASVS 5.0 nivel 2 y Top 10)

| Tema | Qué hay |
|---|---|
| Control de acceso | Matriz de permisos en el dominio. Cada caso de uso exige **rol y sede** (probado). Lo ajeno responde 404, así que no se puede adivinar qué existe. |
| Contraseñas | **HMAC-SHA256 con pimienta + bcrypt costo 12**, sin el límite de 72 bytes de bcrypt. Los hashes viejos se actualizan solos al ingresar (verificado con los usuarios demo). Política de 8 a 128 caracteres, lista de claves comunes y consulta a Have I Been Pwned. |
| Sesiones | JWT de acceso de 15 min y refresh rotativo en cookies `httpOnly`, `Secure`, `SameSite=Strict` y `__Host-`. Detecta reuso del refresh. La sesión se revoca al salir, al cambiar la contraseña y al cambiar el rol o la sede. Bloqueo temporal tras 5 fallos. |
| Entradas y salidas | Zod en todas las rutas, consultas parametrizadas, HTML escapado en correos, límites de tamaño y de solicitudes por ruta. |
| Navegador | CSP estricta con nonce y sin `unsafe-eval` (sin violaciones), HSTS, CORS restringido, CSRF con token de doble envío y verificación de origen, Helmet, y `Cache-Control: no-store` en la API. |
| Integraciones | Firma del webhook de WhatsApp sobre el cuerpo crudo, listas blancas contra SSRF (push y medios de Meta) y la IA restringida a un catálogo cerrado. |
| Datos personales | Aviso de privacidad (Ley 1581) con aceptación registrada, logs con redacción y auditoría de acciones del admin. Secretos solo en variables de entorno. |
| Dependencias | `pnpm audit --prod`: 0. En desarrollo hay 2 moderadas (`esbuild` vía `drizzle-kit` y `minimatch` vía ESLint) que no llegan a producción. |

En el cierre corregí: el truncamiento de bcrypt, el caché de respuestas de la API, el paso de rutas `..` por el proxy, una violación de CSP que provocaba Zod en el navegador y una **recarga automática de la página en la primera visita** (podía interrumpir un checkout).

## Decisiones principales

Las 82 decisiones, con su porqué, están en [DECISIONES.md](DECISIONES.md). Las que más pesan:

1. **Hexagonal de verdad**: dominio puro, casos de uso, puertos y adaptadores. Cada integración externa tiene un adaptador real y otro de desarrollo, y la app elige según las variables de entorno (D1–D9).
2. **Proxy del mismo origen** (`/api/*` en la web): las cookies son de primera parte aunque la web esté en Vercel y la API en Railway (D11).
3. **CSP con nonce**: todas las páginas se renderizan en el servidor en cada visita. Prioricé la seguridad sobre el prerender (D10).
4. **IA solo para clasificar**: Claude (`claude-opus-5-5`, configurable) convierte el mensaje en una solicitud del catálogo. Sin llave, responde un intérprete por reglas (D54–D55).
5. **Rendimiento en celular**: menú renderizado en el servidor, Motion solo donde aporta, fuentes recortadas y service worker después de la carga (D63–D68).
6. **Mesas sobre lo ya probado**: cada ronda es un pedido de canal «mesa» dentro de una cuenta, así que la cocina, el descuento por receta, las cancelaciones y los reportes son los mismos que en los domicilios (D70–D78).

## Lo que necesito de ti

En orden de prioridad (el detalle de cada variable está en [PENDIENTES.md](PENDIENTES.md)):

1. **Repositorio en GitHub y cuenta de Railway**, y Vercel si quieres la web allá. Con eso despliego y te entrego la URL.
2. **Correo transaccional** (Resend o SMTP) y un dominio verificado. Sin esto, los códigos de registro no le llegan a nadie fuera de tu computador.
3. **Datos reales**: razón social, NIT y correo de privacidad para el aviso (y que lo revise un abogado), fotos de los productos, QR de pago de cada sede, horarios, tarifas, cobertura, menú y recetas con cantidades.
4. **Google** (cliente OAuth) y, si lo quieres, **Apple** (cuenta de desarrollador, USD 99 al año).
5. **WhatsApp Business Cloud API** (app de Meta, número verificado, token y App Secret), **llave de Anthropic** y **llave de transcripción** (OpenAI o compatible) para las notas de voz.
6. **Mapas en producción**: un proveedor de teselas con llave (MapTiler, Stadia o Carto) y, si quieres tráfico real en las rutas, Google Maps.
7. Llaves **VAPID** de producción (el comando está en `.env.example`).

## Correr y desplegar

- **Local**: `pnpm install`, `cp .env.example .env`, `pnpm db:up`, `pnpm db:reset` y `pnpm dev`. Usuarios de prueba y comandos en el [README](README.md).
- **Despliegue**: `apps/api/railway.json` y `apps/web/railway.json` construyen con los Dockerfiles, corren las migraciones antes de cada despliegue y revisan la salud del servicio. El primer administrador se crea con `node dist/crear-admin.js tu@correo.com`. Pasos completos en el [README](README.md#desplegar).
- **Docker**: `docker build -f apps/api/Dockerfile -t rejana-api .` y `docker build -f apps/web/Dockerfile -t rejana-web .` (las dos construyen y arrancan; ver tamaños en PROGRESO).

## Riesgos y limitaciones

- **Sin MFA para el personal ni el admin.** ASVS 5.0 L2 lo pide. Hoy el personal entra con contraseña (con bloqueo y revocación), y Google y Apple aplican el MFA de su propia cuenta. Es lo primero que haría después: TOTP o passkeys, al menos para el administrador.
- **Un solo proceso de API.** El límite de solicitudes y Socket.IO viven en memoria: se reinician con cada despliegue y no se comparten entre réplicas. Para escalar hace falta Redis.
- **Mapas**: las teselas públicas de OpenStreetMap no sirven para tráfico de producción, y sin Google Maps los tiempos de ruta se estiman por distancia, sin tráfico.
- **Push en iPhone**: solo funciona con la app instalada en la pantalla de inicio (iOS 16.4 o superior).
- **`TOKENS_PEPPER` no se puede cambiar** sin obligar a todos a restablecer su contraseña (D60). Guárdala como un secreto crítico.
- **Lighthouse** se midió en local. Los números reales dependen del hosting y de la red; conviene repetirlo con la URL desplegada.
- **Sin monitoreo externo** (Sentry, alertas de caída). Hay logs estructurados y auditoría, pero nadie recibe un aviso si algo falla.
- **Costo de la IA**: el modelo por defecto es el más capaz. Si el volumen crece, `ANTHROPIC_MODEL=claude-haiku-5-5` lo abarata.
- **Textos legales**: el aviso de privacidad es una base conforme a la Ley 1581, no reemplaza la revisión de un abogado.
- **Mesero**: no tiene plano con la posición de cada mesa, ni trasladar o juntar mesas, ni turnos; estaban en el demo y quedaron en PENDIENTES. Falta definir con el contador cómo se reparte la propina.

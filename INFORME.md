# Informe final · MVP de La Rejana Callejera

Fecha: 4 de noviembre de 2026 · Rama `main`. No hice `git push`: el remoto `origin` (`Daga7/la-rejana-mvp`) ya existe y tú subes los commits cuando los revises.

## En resumen

- El MVP está **completo y funcionando en local**:
  - las 8 fases del plan, el cierre (seguridad, auditoría de dependencias, Lighthouse, Docker) y el **módulo de mesero**;
  - el **segundo lote**: plano por zona, mover y juntar mesas, turnos, Pasaporte de sellos y propina de 0 o 10 %.
  
  Cada tema quedó en su propio commit.
- **Listo para desplegar en Supabase, Railway y Vercel desde la tableta, sin consola, pero todavía no está desplegado**: faltan tus cuentas. El paso a paso y las variables exactas de cada servicio están en el [README](README.md#desplegar). Lo probé en local con el mismo pooler que usa Supabase (Supavisor, con TLS) y con un build igual al de Vercel.
- Pruebas: **183 de la API** (unitarias e integración contra PostgreSQL real, que también pasan por el pooler de Supabase) y **11 de punta a punta en el navegador**, todas en verde.
- Lighthouse en celular, sobre el build de producción: **Rendimiento entre 90 y 98 y 100 en Accesibilidad, Buenas prácticas y SEO** en las ocho páginas públicas, ahora con `/pasaporte`. La app es instalable y funciona sin conexión.
- `pnpm audit --prod`: **0 vulnerabilidades**.
- Memoria de la API, medida en su imagen Docker: **unos 85 MB en reposo y 140 MB con mucha carga**. Importa porque Railway cobra por uso.
- Pendiente de seguridad más importante: **segundo factor (MFA) para el personal y el administrador** (ver [Riesgos](#riesgos-y-limitaciones)).

## Qué funciona

| Módulo | Qué hace hoy |
|---|---|
| Acceso | La pantalla de inicio tiene tres opciones: pedir como invitado, crear cuenta o ingresar. El registro usa un código de 6 dígitos por correo (vence en 10 min, máximo 5 intentos y reenvío limitado); la cuenta solo se crea al verificarlo. También hay recuperación de contraseña e invitaciones de empleados de un solo uso, que vencen y sirven solo para ese correo. Google y Apple tienen adaptadores reales y un selector simulado para desarrollo; sus botones **solo aparecen si la API tiene sus credenciales**. |
| Menú | Hamburguesas y choriperros con precio y disponibilidad por sede. Un producto se marca **agotado solo** cuando falta un insumo de su receta, y la tarjeta avisa «¡quedan N!». |
| Inventario | Recetas por producto con **descuento automático** al confirmar el pedido, en transacción y con bloqueo para no sobrevender. Repone si se cancela, registra entradas y conteos, calcula la capacidad por producto y avisa en vivo cuando el stock está bajo. |
| Pedidos | Checkout tipo Rappi: mapa con pin, ubicación del celular, direcciones guardadas, cobertura por sede, pago en efectivo (con «paga con») o QR del restaurante. Estados recibido → en preparación → listo → en camino → entregado (y cancelado). Notificaciones push (VAPID) y seguimiento en vivo. |
| Domiciliario | Ruta óptima (algoritmo exacto), límite de minutos configurable por sede, sugerencia de dividir en varias salidas y botones de Google Maps y Waze. Comparte su GPS en vivo **solo con el cliente de cada pedido y solo mientras va en camino**. |
| Cocina, caja y admin | Tablero de cocina en tres columnas, donde cada tarjeta dice si es domicilio o mesa. La caja asigna domiciliario, cobra con cambio, cierra y cancela, y tiene una pestaña de **mesas** para cobrarlas. El admin tiene tablero de ventas por sede, inventario, menú y recetas, sedes (con sus mesas y su plano), empleados, turnos, Pasaporte y auditoría. |
| Buzón | Quejas y sugerencias del personal. Si son anónimas no se guarda nada que identifique a quien escribe, y la base de datos lo impide con una restricción. |
| Asistente de WhatsApp | Para administradores autorizados: entiende texto o notas de voz, convierte el pedido en un reporte de un **catálogo cerrado** (ventas, lo más vendido, inventario; nunca SQL libre) y responde con un **PDF con la marca y gráficas**. Si no entiende, pide aclaración. Desde `/admin/asistente` se puede probar sin la cuenta de Meta. |
| PWA | Se puede instalar, tiene íconos, splash y página sin conexión. La portada y el menú abren sin internet desde la primera visita. Hay aviso de versión nueva. |
| Mesero | **Plano de cada zona** (o lista, si se prefiere) con cada mesa pintada según su estado: libre, ocupada, lista para servir o pidió la cuenta. Abre la mesa con el número de personas y toma el pedido en el celular, con menú por categorías, notas para la cocina y cantidades. Envía cada **ronda** a la cocina, con descuento de inventario por receta. Le llega en vivo lo que está listo, marca «Ya lo serví» y pide la cuenta. Puede **trasladar** la cuenta a otra mesa, **juntar** mesas para un grupo (las rondas y pagos de la otra cuenta pasan a la principal) y **separarlas**: todo auditado y en vivo para el salón, la caja y la cocina. Nunca ve los domicilios ni los datos de los clientes. |
| Plano (admin) | Ubica las mesas de cada zona en una cuadrícula con toques: elige la mesa, toca la casilla y ajusta el tamaño y la forma. Funciona bien en el celular. La API no deja mesas fuera del plano ni encimadas. |
| Caja y propina | La caja cobra la mesa en uno o varios pagos (efectivo con cambio o QR). La propina es **0 o exactamente el 10 %** del consumo, redondeado a la centena; la API rechaza cualquier otro valor. Las mesas juntadas se cobran como una sola cuenta. |
| Turnos | Cada empleado marca entrada y salida desde su barra. El admin ve los turnos y las horas por persona y sede, cierra un turno que alguien olvidó cerrar y ve marcados los de más de 16 horas. No hay cierre de caja. |
| Pasaporte de sellos | El cliente se inscribe con su consentimiento y ve su tarjeta, su código y su historial. La caja verifica el código, da el sello al cobrar la mesa y canjea el premio, que entra a la cocina como una ronda de precio cero. Los domicilios pagados suman el sello solos. El admin elige el premio, los sellos necesarios, la compra mínima y la vigencia. La API impide sellos duplicados y sellos por pedidos sin pagar o cancelados. Ley 1581: la caja solo ve el nombre de pila y los sellos, y salir del programa borra los sellos. |
| Despliegue sin consola | Las migraciones corren solas antes de cada despliegue. Los datos de prueba se cargan al arrancar si los pides, solo con la base vacía. El primer administrador recibe su invitación por correo con `ADMIN_INICIAL_CORREO`. |

Quedan fuera del MVP, como pediste: pagos con tarjeta dentro de la app (el puerto para Wompi ya está listo), que el cliente pida desde la mesa (en el restaurante pide el mesero), facturación electrónica DIAN, apps nativas, ingreso por PIN (descartado) y cierre de caja.

## Cómo lo verifiqué

- **API**: 183 pruebas en 21 archivos. Cubren lo crítico:
  - Acceso: registro, sesiones y bloqueos, y permisos por **rol y sede** (cada rol solo ve su módulo y su sede).
  - Inventario y pedidos: descuento por receta (también en las rondas de mesa), concurrencia sin sobreventa e idempotencia.
  - Privacidad e integraciones: GPS, datos de domicilio que el mesero no recibe, firma del webhook y anonimato del buzón.
  - Del lote:
    - plano (límites y choques);
    - trasladar y juntar sin perder rondas ni pagos;
    - turnos;
    - propina de 0 o 10 %;
    - Pasaporte: sellos duplicados, sellos por pedidos sin pagar o cancelados, canje y salida con borrado.
  - Del despliegue: conexión TLS, datos de prueba solo con la base vacía (dos arranques a la vez siembran una sola vez), invitación del primer administrador e IP real detrás del proxy de Railway.
- **Navegador** (Playwright, perfil Pixel 7), 11 pruebas:
  - compra de un invitado con seguimiento en vivo;
  - domiciliario y cliente en dos navegadores;
  - cocina, caja, tablero del admin, buzón y asistente con descarga del PDF;
  - el flujo completo del mesero y, desde el plano, trasladar una mesa y juntarle otra;
  - turnos con las horas en el admin;
  - Pasaporte: la caja verifica el código al cobrar y la clienta recibe su sello.
- **Pooler de Supabase**: corrí Supavisor 2.9.13 (el pooler de Supabase) en Docker, en modo sesión y con TLS. Funcionaron:
  - la conexión cifrada, con y sin verificar el certificado (con una CA equivocada falla, como debe);
  - una URL con `sslmode=require`, las migraciones de Drizzle y **las 183 pruebas de la API**;
  - el build de producción arrancando con el seed, el inicio de sesión del admin de prueba y la invitación del primer administrador en una base vacía.

  Así encontré que Supavisor **ignora en silencio** el límite de 15 s por consulta que mandaba `pg` al abrir la conexión. Ahora se fija con `SET` y sí aplica.
- **Vercel**: build en un clon limpio con Node 24, Root Directory `apps/web`, pnpm 11 por Corepack y sin `NEXT_OUTPUT`. Instala desde `apps/web` con el lockfile congelado, resuelve `@rejana/shared` y compila con el proxy de CSP.
- **Memoria**: la imagen de la API contra el pooler, con 1.000 solicitudes por segundo. Sin límite usaba 209 MB en reposo y 740 MB tras la carga, sin volver a bajar. Con el heap acotado en la imagen usa 83 MB y 141 MB, con el mismo rendimiento.
- **Lighthouse 12, celular** (simulación de 4G lento y CPU 4× más lenta), build de producción en local, después del lote y del despliegue:

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP | TBT |
|---|---|---|---|---|---|---|
| `/` (inicio) | 96 | 100 | 100 | 100 | 2,7 s | 70 ms |
| `/menu` | 93 | 100 | 100 | 100 | 3,1 s | 100 ms |
| `/carrito` | 92 | 100 | 100 | 100 | 3,3 s | 110 ms |
| `/ingresar` | 90–95 | 100 | 100 | 100 | 2,3–3,0 s | 190–240 ms |
| `/registro` | 94 | 100 | 100 | 100 | 2,4 s | 210 ms |
| `/recuperar` | 92 | 100 | 100 | 100 | 3,0 s | 190 ms |
| `/privacidad` | 97 | 100 | 100 | 100 | 2,5 s | 90 ms |
| `/pasaporte` | 98 | 100 | 100 | 100 | 2,2 s | 130 ms |

  `/ingresar` lo medí tres veces (90, 95 y 92); el puntaje varía unos puntos entre corridas.

  Lighthouse 12 ya no tiene la categoría PWA. Por eso en el cierre revisé la instalación directamente en Chromium: **sin errores de instalabilidad**, manifiesto sin errores, íconos normales y *maskable*. También comprobé que portada y menú abren desde la caché sin servidor.

  Las pantallas del personal no entran en la tabla porque requieren sesión.

## Seguridad (OWASP ASVS 5.0 nivel 2 y Top 10)

| Tema | Qué hay |
|---|---|
| Control de acceso | Matriz de permisos en el dominio. Cada caso de uso exige **rol y sede** (probado). Lo ajeno responde 404, así que no se puede adivinar qué existe. |
| Contraseñas | **HMAC-SHA256 con pimienta + bcrypt costo 12**, sin el límite de 72 bytes de bcrypt. Los hashes viejos se actualizan solos al ingresar. Política de 8 a 128 caracteres, lista de claves comunes y consulta a Have I Been Pwned. |
| Sesiones | JWT de acceso de 15 min y refresh rotativo en cookies `httpOnly`, `Secure`, `SameSite=Strict` y `__Host-`. Detecta reuso del refresh. La sesión se revoca al salir, al cambiar la contraseña y al cambiar el rol o la sede. Bloqueo temporal tras 5 fallos. |
| Entradas y salidas | Zod en todas las rutas, consultas parametrizadas, HTML escapado en correos, límites de tamaño y de solicitudes por ruta. Mover y juntar mesas y el Pasaporte usan bloqueos y restricciones únicas en la base contra carreras y reintentos. |
| Navegador | CSP estricta con nonce y sin `unsafe-eval` (sin violaciones), HSTS, CORS restringido, CSRF con token de doble envío y verificación de origen, Helmet, y `Cache-Control: no-store` en la API. |
| Red y despliegue | Base de datos con TLS (con verificación del certificado si se pega el de Supabase). Detrás del proxy de Railway, la API toma la IP real y no la que invente el cliente (probado). Las migraciones corren antes de desplegar. Los datos de prueba exigen confirmación explícita y una base vacía. |
| Integraciones | Firma del webhook de WhatsApp sobre el cuerpo crudo, listas blancas contra SSRF (push y medios de Meta) y la IA restringida a un catálogo cerrado. |
| Datos personales | Aviso de privacidad (Ley 1581) con aceptación registrada, ahora con las secciones del Pasaporte y de los turnos. El Pasaporte exige consentimiento propio y en la caja usa un código en vez del teléfono; salir borra los sellos. Logs con redacción y auditoría de acciones del admin. Secretos solo en variables de entorno. |
| Dependencias | `pnpm audit --prod`: 0. En desarrollo hay 2 moderadas (`esbuild` vía `drizzle-kit` y `minimatch` vía ESLint) que no llegan a producción. |

## Decisiones principales

Las 109 decisiones, con su porqué, están en [DECISIONES.md](DECISIONES.md). Las que más pesan:

1. **Hexagonal de verdad**: dominio puro, casos de uso, puertos y adaptadores. Cada integración externa tiene un adaptador real y otro de desarrollo, y la app elige según las variables de entorno (D1–D9).
2. **Proxy del mismo origen** (`/api/*` en la web): las cookies son de primera parte aunque la web esté en Vercel y la API en Railway (D11).
3. **CSP con nonce**: todas las páginas se renderizan en el servidor en cada visita. Prioricé la seguridad sobre el prerender (D10).
4. **IA solo para clasificar**: Claude (`claude-opus-5-5`, configurable) convierte el mensaje en una solicitud del catálogo. Sin llave, responde un intérprete por reglas (D54–D55).
5. **Mesas sobre lo ya probado**: cada ronda es un pedido de canal «mesa» dentro de una cuenta, así que la cocina, el descuento por receta, los reportes y ahora mover y juntar mesas usan el mismo modelo (D70–D78, D85).
6. **Pasaporte con la Ley 1581 desde el diseño**: consentimiento propio, código en vez de teléfono, salida con borrado y reglas contra el fraude en la base (D88–D90).
7. **Despliegue sin consola**: pooler de Supabase en modo sesión con TLS, migraciones en el pre-deploy, datos de prueba y primer administrador por variables, y memoria acotada (D95–D109).

## Lo que necesito de ti

En orden de prioridad (el detalle de cada variable está en [PENDIENTES.md](PENDIENTES.md)):

1. **Revisar y subir los commits**, crear las cuentas de **Supabase, Railway y Vercel** y seguir el [README](README.md#desplegar): todo se hace desde el panel de cada servicio. Para la prueba bastan las variables de la lista; no hace falta ningún proveedor externo.
2. **Correo transaccional** (Resend o SMTP) y un dominio verificado. Sin esto, en la prueba los códigos de registro solo quedan en los logs de Railway.
3. **Datos reales**: razón social, NIT y correo de privacidad para el aviso (y que lo revise un abogado), fotos de los productos, QR de pago de cada sede, horarios, tarifas, cobertura, menú y recetas con cantidades.
4. **Cómo se reparte la propina** entre el personal (con el contador).
5. **Google** (cliente OAuth) y, si lo quieres, **Apple** (cuenta de desarrollador, USD 99 al año).
6. **WhatsApp Business Cloud API** (app de Meta, número verificado, token y App Secret), **llave de Anthropic** y **llave de transcripción** (OpenAI o compatible) para las notas de voz.
7. **Mapas en producción**: un proveedor de teselas con llave (MapTiler, Stadia o Carto) y, si quieres tráfico real en las rutas, Google Maps.
8. Llaves **VAPID** de producción para las notificaciones push (se generan una vez; te las genero desde el PC si quieres).

## Correr y desplegar

- **Local**: `pnpm install`, `cp .env.example .env`, `pnpm db:up`, `pnpm db:reset` y `pnpm dev`. Usuarios de prueba y comandos en el [README](README.md).
- **Despliegue**: Supabase (base), Railway (API con `apps/api/railway.json`, que corre las migraciones antes de cada despliegue y revisa la salud) y Vercel (web, Root Directory `apps/web`). Variables exactas para la prueba y para producción, y la lista de **qué limpiar antes de abrir al público**, en el [README](README.md#desplegar).
- **Docker**: `docker build -f apps/api/Dockerfile -t rejana-api .` (unos 457 MB) y `docker build -f apps/web/Dockerfile -t rejana-web .` (para correr la web fuera de Vercel).

## Riesgos y limitaciones

- **Sin MFA para el personal ni el admin.** ASVS 5.0 L2 lo pide. Hoy el personal entra con contraseña (con bloqueo y revocación), y Google y Apple aplican el MFA de su propia cuenta. Es lo primero que haría después: TOTP o passkeys, al menos para el administrador.
- **La prueba usa datos y usuarios de ejemplo con una contraseña publicada** en el README. Para abrir al público hay que seguir la lista del README: base nueva, seed apagado, secretos rotados y correo real.
- **Vercel Hobby no permite uso comercial.** Para la operación real hace falta el plan Pro, o correr la web en Railway con su Dockerfile.
- **Supabase gratis puede pausar el proyecto** tras una semana sin actividad; se reactiva desde su panel.
- **TLS con la base sin verificar** mientras no pegues el certificado de Supabase en `DATABASE_SSL_CA`. La conexión va cifrada, pero sin comprobar el servidor.
- **Un solo proceso de API.** El límite de solicitudes y Socket.IO viven en memoria: se reinician con cada despliegue y no se comparten entre réplicas. Para escalar hace falta Redis.
- **Mapas**: las teselas públicas de OpenStreetMap no sirven para tráfico de producción, y sin Google Maps los tiempos de ruta se estiman por distancia, sin tráfico.
- **Push en iPhone**: solo funciona con la app instalada en la pantalla de inicio (iOS 16.4 o superior).
- **`TOKENS_PEPPER` no se puede cambiar** sin obligar a todos a restablecer su contraseña (D60). Por eso hay que rotarla antes de tener usuarios reales, y después guardarla como un secreto crítico.
- **Lighthouse** se midió en local. Los números reales dependen del hosting y de la red; conviene repetirlo con la URL desplegada.
- **Sin monitoreo externo** (Sentry, alertas de caída). Hay logs estructurados y auditoría, pero nadie recibe un aviso si algo falla.
- **Costo de la IA**: el modelo por defecto es el más capaz. Si el volumen crece, `ANTHROPIC_MODEL=claude-haiku-5-5` lo abarata.
- **Textos legales**: el aviso de privacidad es una base conforme a la Ley 1581, no reemplaza la revisión de un abogado.
- **Propina y turnos**: falta definir cómo se reparte la propina, y los turnos no calculan nómina, horas extra ni recargos.

# Pendientes y lo que necesito de Daniel

Integraciones que ya tienen adaptador real **y** adaptador de desarrollo. Mientras falte la credencial, la app funciona con el mock indicado.

| Integración | Qué falta (lo da Daniel) | Variable(s) | Mientras tanto |
|---|---|---|---|
| Despliegue | Cuentas de **Supabase**, **Railway** y **Vercel**, y conectar el repositorio `Daga7/la-rejana-mvp` (ya existe) | Lista exacta por servicio en el [README](README.md#desplegar) | Todo está listo para configurarlo desde el panel de cada servicio, sin consola. Probado en local con el mismo pooler de Supabase (Supavisor) y un build como el de Vercel |
| Correo | Proveedor transaccional (Resend o un SMTP como Brevo/SES) y dominio verificado para el remitente | `EMAIL_PROVEEDOR`, `RESEND_API_KEY` o `SMTP_*`, `EMAIL_REMITENTE` | Mailpit en local (http://localhost:8025); en la prueba desplegada, consola (los correos quedan en los logs de Railway) |
| Google | Proyecto en Google Cloud con OAuth (cliente web) y la URL de retorno `https://<web>/api/auth/oauth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Selector OAuth simulado (`OAUTH_MOCK=true`, solo desarrollo) |
| Apple | Cuenta de Apple Developer (USD 99/año): Services ID, Team ID, Key ID y llave `.p8`; dominio verificado | `APPLE_*` | Selector OAuth simulado |
| Push | Generar llaves VAPID de producción (comando en `.env.example`) | `VAPID_*` | En local ya hay llaves generadas; sin llaves se imprime en consola |
| WhatsApp | App de Meta con WhatsApp Business Cloud API, número verificado, token permanente, App Secret y suscripción del webhook a `https://<api>/api/webhooks/whatsapp` | `WHATSAPP_*` | Los PDF se guardan en `apps/api/tmp/whatsapp` |
| IA (intención) | API key de Anthropic | `ANTHROPIC_API_KEY` | Intérprete por reglas (palabras clave) |
| Transcripción de voz | API key de OpenAI (o proveedor compatible) | `STT_API_KEY` | Mock que pide escribir el mensaje |
| Mapas en producción | Proveedor de teselas con llave (MapTiler, Stadia, Carto) y, si se quiere precisión de tráfico, Google Maps API | `MAPA_TESELAS_URL`, `GOOGLE_MAPS_API_KEY`, `MAPAS_PROVEEDOR` | Teselas públicas de OpenStreetMap (uso ligero) y tiempos estimados por distancia |

## Contenido y legal

- **Aviso de privacidad**: texto base conforme a la Ley 1581 de 2012, con las secciones del Pasaporte de sellos y de los turnos. Faltan razón social, NIT, correo real de privacidad y la revisión de un abogado.
- **Fotos reales** de los productos (hoy son ilustraciones) y el **QR de pago** real de cada sede (hoy hay un QR de ejemplo).
- Horarios, tarifas de domicilio, radios de cobertura y direcciones exactas de las sedes.
- Menú real y recetas reales (cantidades por insumo) para que el inventario cuadre.

## Técnicos

- **MFA para el personal y el administrador** (TOTP o passkeys): lo pide OWASP ASVS 5.0 nivel 2 y no está en el MVP. Es lo primero que haría después del despliegue.
- **Monitoreo**: errores y caídas con avisos (Sentry, Better Stack u otro). Hoy solo hay logs estructurados y auditoría.
- Varias réplicas de la API requieren Redis para rate limiting y Socket.IO (hoy, un solo proceso).
- Repetir Lighthouse con la URL desplegada (las mediciones del cierre son en local).
- **Propina**: definir con el contador cómo se reparte entre el personal. Hoy es 0 o el 10 % exacto del consumo, se registra por cuenta y no cuenta como venta.
- **Turnos**: la app registra entradas, salidas y horas por persona, pero no calcula nómina, horas extra ni recargos nocturnos o dominicales.
- **Antes de abrir al público**: seguir la lista del [README](README.md#antes-de-abrir-al-público). Lo principal es un proyecto nuevo de Supabase, apagar el seed, rotar los secretos y configurar un correo real.
- **Vercel Hobby no permite uso comercial**: para la operación real hace falta el plan Pro, o correr la web en Railway con `apps/web/Dockerfile`.
- Pasarela de tarjetas (Wompi): fuera del MVP; el puerto `PasarelaPagos` está definido.
- En desarrollo, `pnpm audit` reporta 2 vulnerabilidades moderadas que no llegan a producción (`esbuild` vía `drizzle-kit` y `minimatch` vía ESLint); se resuelven cuando esas herramientas actualicen sus dependencias.

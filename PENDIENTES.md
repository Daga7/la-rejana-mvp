# Pendientes y lo que necesito de Daniel

Integraciones que ya tienen adaptador real **y** adaptador de desarrollo. Mientras falte la credencial, la app funciona con el mock indicado.

| Integración | Qué falta (lo da Daniel) | Variable(s) | Mientras tanto |
|---|---|---|---|
| Despliegue | Cuenta de Railway (y opcionalmente Vercel) y un repositorio en GitHub para conectar | — | Todo corre en local con Docker Compose; imágenes Docker reconstruidas y probadas en modo producción al cierre |
| Correo | Proveedor transaccional (Resend o un SMTP como Brevo/SES) y dominio verificado para el remitente | `EMAIL_PROVEEDOR`, `RESEND_API_KEY` o `SMTP_*`, `EMAIL_REMITENTE` | Mailpit en local (http://localhost:8025) o consola |
| Google | Proyecto en Google Cloud con OAuth (cliente web) y la URL de retorno `https://<web>/api/auth/oauth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Selector OAuth simulado (`OAUTH_MOCK=true`, solo desarrollo) |
| Apple | Cuenta de Apple Developer (USD 99/año): Services ID, Team ID, Key ID y llave `.p8`; dominio verificado | `APPLE_*` | Selector OAuth simulado |
| Push | Generar llaves VAPID de producción (comando en `.env.example`) | `VAPID_*` | En local ya hay llaves generadas; sin llaves se imprime en consola |
| WhatsApp | App de Meta con WhatsApp Business Cloud API, número verificado, token permanente, App Secret y suscripción del webhook a `https://<api>/api/webhooks/whatsapp` | `WHATSAPP_*` | Los PDF se guardan en `apps/api/tmp/whatsapp` |
| IA (intención) | API key de Anthropic | `ANTHROPIC_API_KEY` | Intérprete por reglas (palabras clave) |
| Transcripción de voz | API key de OpenAI (o proveedor compatible) | `STT_API_KEY` | Mock que pide escribir el mensaje |
| Mapas en producción | Proveedor de teselas con llave (MapTiler, Stadia, Carto) y, si se quiere precisión de tráfico, Google Maps API | `MAPA_TESELAS_URL`, `GOOGLE_MAPS_API_KEY`, `MAPAS_PROVEEDOR` | Teselas públicas de OpenStreetMap (uso ligero) y tiempos estimados por distancia |

## Contenido y legal

- **Aviso de privacidad**: texto base conforme a la Ley 1581 de 2012; falta razón social, NIT, correo real de privacidad y revisión de un abogado.
- **Fotos reales** de los productos (hoy son ilustraciones) y el **QR de pago** real de cada sede (hoy hay un QR de ejemplo).
- Horarios, tarifas de domicilio, radios de cobertura y direcciones exactas de las sedes.
- Menú real y recetas reales (cantidades por insumo) para que el inventario cuadre.

## Técnicos

- **MFA para el personal y el administrador** (TOTP o passkeys): lo pide OWASP ASVS 5.0 nivel 2 y no está en el MVP. Es lo primero que haría después del despliegue.
- **Monitoreo**: errores y caídas con avisos (Sentry, Better Stack u otro). Hoy solo hay logs estructurados y auditoría.
- Varias réplicas de la API requieren Redis para rate limiting y Socket.IO (hoy, un solo proceso).
- Repetir Lighthouse con la URL desplegada (las mediciones del cierre son en local).
- **Módulo del mesero**: después del MVP (hoy solo existe el rol).
- Pasarela de tarjetas (Wompi): fuera del MVP; el puerto `PasarelaPagos` está definido.
- En desarrollo, `pnpm audit` reporta 2 vulnerabilidades moderadas que no llegan a producción (`esbuild` vía `drizzle-kit` y `minimatch` vía ESLint); se resuelven cuando esas herramientas actualicen sus dependencias.

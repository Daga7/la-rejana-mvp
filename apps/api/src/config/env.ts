import { correo } from '@rejana/shared'
import { z } from 'zod'

// Configuración validada al arrancar: si falta algo crítico la API no inicia.

const booleano = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1')

const opcional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))

const secreto = z.string().min(32, 'debe tener al menos 32 caracteres')

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    PORT: z.coerce.number().int().default(4000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: booleano,
    /** Certificado raíz (PEM) del proveedor para verificar el servidor (opcional; sin él se cifra sin verificar). */
    DATABASE_SSL_CA: opcional,
    /** Conexiones máximas de la API. Con el pooler en modo sesión de Supabase cada una ocupa un cupo del pool. */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    WEB_ORIGIN: z.url(),
    API_PUBLIC_URL: z.url(),
    CORS_ORIGINS: opcional,
    JWT_SECRET: secreto,
    TOKENS_PEPPER: secreto,
    PROXY_SHARED_SECRET: secreto,
    COOKIE_SECURE: booleano,
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /** Inicios de sesión por minuto e IP. Solo se puede subir fuera de producción (p. ej. para las pruebas e2e). */
    LIMITE_INGRESOS_POR_MINUTO: z.coerce.number().int().min(10).max(1000).default(10),
    HIBP_HABILITADO: booleano,
    /** Solo para pruebas y demos: acepta pedidos aunque la sede esté cerrada. */
    PERMITIR_PEDIDOS_FUERA_DE_HORARIO: booleano,

    /** Carga los datos de prueba al arrancar, solo si la base está vacía (sin sedes ni usuarios). */
    SEED_AL_INICIAR: booleano,
    /** Confirmación explícita para cargar datos de prueba con NODE_ENV=production (crean usuarios con contraseña conocida). */
    SEED_PERMITIR_PRODUCCION: booleano,
    /** Si no hay ningún administrador activo, le envía a este correo una invitación de un solo uso (sin consola). */
    ADMIN_INICIAL_CORREO: opcional,

    EMAIL_PROVEEDOR: z.enum(['consola', 'smtp', 'resend']).default('consola'),
    EMAIL_REMITENTE: z.string().default('La Rejana Callejera <no-responder@larejana.co>'),
    SMTP_HOST: opcional,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: booleano,
    SMTP_USUARIO: opcional,
    SMTP_CLAVE: opcional,
    RESEND_API_KEY: opcional,

    OAUTH_MOCK: booleano,
    GOOGLE_CLIENT_ID: opcional,
    GOOGLE_CLIENT_SECRET: opcional,
    APPLE_CLIENT_ID: opcional,
    APPLE_TEAM_ID: opcional,
    APPLE_KEY_ID: opcional,
    APPLE_PRIVATE_KEY: opcional,

    VAPID_PUBLIC_KEY: opcional,
    VAPID_PRIVATE_KEY: opcional,
    VAPID_SUBJECT: z.string().default('mailto:soporte@larejana.co'),

    MAPAS_PROVEEDOR: z.enum(['haversine', 'osrm', 'google']).default('haversine'),
    OSRM_URL: z.string().default('https://router.project-osrm.org'),
    GOOGLE_MAPS_API_KEY: opcional,
    VELOCIDAD_PROMEDIO_KMH: z.coerce.number().min(5).max(80).default(22),
    GEOCODER: z.enum(['nominatim', 'google', 'ninguno']).default('nominatim'),
    NOMINATIM_URL: z.string().default('https://nominatim.openstreetmap.org'),

    WHATSAPP_PROVEEDOR: z.enum(['consola', 'meta']).default('consola'),
    WHATSAPP_TOKEN: opcional,
    WHATSAPP_PHONE_NUMBER_ID: opcional,
    WHATSAPP_APP_SECRET: opcional,
    WHATSAPP_VERIFY_TOKEN: opcional,
    WHATSAPP_GRAPH_VERSION: z.string().default('v23.0'),

    IA_PROVEEDOR: z.enum(['reglas', 'anthropic']).default('reglas'),
    ANTHROPIC_API_KEY: opcional,
    ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
    STT_PROVEEDOR: z.enum(['mock', 'openai']).default('mock'),
    STT_API_KEY: opcional,
    STT_BASE_URL: z.string().default('https://api.openai.com/v1'),
    STT_MODELO: z.string().default('gpt-4o-mini-transcribe'),
  })
  .superRefine((env, ctx) => {
    const exigir = (cond: boolean, campo: string, mensaje: string) => {
      if (!cond) ctx.addIssue({ code: 'custom', path: [campo], message: mensaje })
    }
    if (env.NODE_ENV === 'production') {
      exigir(env.COOKIE_SECURE, 'COOKIE_SECURE', 'debe ser true en producción')
      exigir(!env.OAUTH_MOCK, 'OAUTH_MOCK', 'no se permite el OAuth simulado en producción')
      exigir(env.WEB_ORIGIN.startsWith('https://'), 'WEB_ORIGIN', 'debe usar https en producción')
      if (env.SEED_AL_INICIAR) exigir(env.SEED_PERMITIR_PRODUCCION, 'SEED_PERMITIR_PRODUCCION', 'debe ser true para cargar datos de prueba en producción (crean usuarios con contraseña conocida)')
    }
    if (env.ADMIN_INICIAL_CORREO) exigir(correo.safeParse(env.ADMIN_INICIAL_CORREO).success, 'ADMIN_INICIAL_CORREO', 'no es un correo válido')
    if (env.EMAIL_PROVEEDOR === 'smtp') exigir(!!env.SMTP_HOST, 'SMTP_HOST', 'requerido con EMAIL_PROVEEDOR=smtp')
    if (env.EMAIL_PROVEEDOR === 'resend') exigir(!!env.RESEND_API_KEY, 'RESEND_API_KEY', 'requerido con EMAIL_PROVEEDOR=resend')
    if (env.WHATSAPP_PROVEEDOR === 'meta') {
      for (const campo of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'] as const) {
        exigir(!!env[campo], campo, 'requerido con WHATSAPP_PROVEEDOR=meta')
      }
    }
    if (env.IA_PROVEEDOR === 'anthropic') exigir(!!env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY', 'requerido con IA_PROVEEDOR=anthropic')
    if (env.STT_PROVEEDOR === 'openai') exigir(!!env.STT_API_KEY, 'STT_API_KEY', 'requerido con STT_PROVEEDOR=openai')
    if (env.MAPAS_PROVEEDOR === 'google' || env.GEOCODER === 'google') exigir(!!env.GOOGLE_MAPS_API_KEY, 'GOOGLE_MAPS_API_KEY', 'requerido para usar Google Maps')
  })

export type Env = z.infer<typeof esquema>

export function cargarEnv(fuente: NodeJS.ProcessEnv = process.env): Env {
  const r = esquema.safeParse(fuente)
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Configuración inválida:\n${detalle}`)
  }
  return r.data
}

/** Orígenes permitidos para CORS / verificación de Origin. */
export function origenesPermitidos(env: Env): string[] {
  const extra = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) : []
  return [...new Set([new URL(env.WEB_ORIGIN).origin, ...extra.map((o) => new URL(o).origin)])]
}

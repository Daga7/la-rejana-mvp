import pino, { type Logger as Pino } from 'pino'
import type { Env } from '../../config/env'

/** Logger estructurado. Nunca registra cookies, tokens, contraseñas ni la query string de las URLs. */
export function crearLogger(env: Env, silencioso = false): Pino {
  return pino({
    level: silencioso ? 'silent' : env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-rejana-proxy-secret"]',
        'req.headers["x-pedido-token"]',
        'res.headers["set-cookie"]',
        '*.clave',
        '*.claveNueva',
        '*.claveActual',
        '*.codigo',
        '*.token',
      ],
      censor: '[oculto]',
    },
    serializers: {
      req: (req: { method: string; url: string; id: string }) => ({ method: req.method, url: String(req.url).split('?')[0], id: req.id }),
      err: pino.stdSerializers.err,
    },
    ...(env.NODE_ENV === 'development' ? { transport: undefined } : {}),
  })
}

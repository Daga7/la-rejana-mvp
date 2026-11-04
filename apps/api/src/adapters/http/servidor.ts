import { isIP } from 'node:net'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify'
import type { Env } from '../../config/env'
import { origenesPermitidos } from '../../config/env'
import type { Actor } from '../../domain/permisos'
import type { Contenedor } from '../../contenedor'
import { leerCookie, nombresCookies } from './cookies'
import { cuerpoError, manejarError } from './errores'

declare module 'fastify' {
  interface FastifyRequest {
    /** IP real del cliente (confiable solo si viene del proxy de la web con el secreto compartido). */
    ipCliente: string
    /** Cuerpo crudo (necesario para verificar firmas de webhooks). */
    cuerpoCrudo?: Buffer
    actorResuelto?: Promise<Actor>
  }
  interface FastifyContextConfig {
    /** false para rutas que no usan cookies de sesión (webhooks, callback de Apple). */
    csrf?: boolean
  }
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface OpcionesServidor {
  env: Env
  c: Contenedor
  log: FastifyBaseLogger
}

export async function crearServidor({ env, c, log }: OpcionesServidor): Promise<FastifyInstance> {
  const permitidos = origenesPermitidos(env)
  const nombres = nombresCookies(env.COOKIE_SECURE)

  const app = Fastify({
    // Solo se confía en los saltos de proxy de la plataforma (Railway = 1); nunca en cualquier X-Forwarded-For.
    trustProxy: (_direccion: string, salto: number) => salto < env.TRUST_PROXY_HOPS,
    bodyLimit: 256 * 1024,
    requestIdHeader: false,
    loggerInstance: log,
  })

  // --- IP real del cliente --------------------------------------------------------
  app.decorateRequest('ipCliente', '')
  app.addHook('onRequest', async (req) => {
    const secreto = req.headers['x-rejana-proxy-secret']
    const ipProxy = req.headers['x-rejana-client-ip']
    if (typeof secreto === 'string' && typeof ipProxy === 'string' && isIP(ipProxy) && c.cripto.compararSeguro(secreto, env.PROXY_SHARED_SECRET)) {
      req.ipCliente = ipProxy
    } else {
      req.ipCliente = req.ip
    }
  })

  // --- Cuerpo JSON conservando el crudo (firmas de webhooks) ---------------------------
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, cuerpo, hecho) => {
    const buf = cuerpo as Buffer
    req.cuerpoCrudo = buf
    if (buf.length === 0) return hecho(null, {})
    try {
      hecho(null, JSON.parse(buf.toString('utf8')))
    } catch {
      const e = new Error('JSON inválido') as Error & { statusCode: number }
      e.statusCode = 400
      hecho(e, undefined)
    }
  })
  // Formulario de Sign in with Apple (response_mode=form_post).
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, cuerpo, hecho) => {
    hecho(null, Object.fromEntries(new URLSearchParams(cuerpo as string)))
  })

  await app.register(cookie)
  await app.register(helmet, {
    // La API solo devuelve JSON/PDF: CSP mínima que no permite nada.
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
    frameguard: { action: 'deny' },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  })
  await app.register(cors, {
    origin: (origen, cb) => cb(null, !origen || permitidos.includes(origen)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key', 'x-pedido-token'],
    maxAge: 600,
  })
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ipCliente || req.ip,
    errorResponseBuilder: (_req, ctx) => {
      const e = new Error('Demasiadas solicitudes') as Error & { statusCode: number }
      e.statusCode = ctx.statusCode
      return e
    },
  })

  // --- CSRF: verificación de origen + token de doble envío ---------------------------
  app.addHook('preHandler', async (req, reply) => {
    if (METODOS_SEGUROS.has(req.method) || req.routeOptions.config.csrf === false) return
    const origen = req.headers.origin
    const sitio = req.headers['sec-fetch-site']
    if ((origen && !permitidos.includes(origen)) || (!origen && sitio === 'cross-site')) {
      return reply.status(403).send(cuerpoError('ORIGEN_NO_PERMITIDO', 'Origen no permitido'))
    }
    const enCookie = leerCookie(req, nombres.csrf)
    const enCabecera = req.headers['x-csrf-token']
    if (!enCookie || typeof enCabecera !== 'string' || !c.cripto.compararSeguro(enCookie, enCabecera)) {
      return reply.status(403).send(cuerpoError('CSRF', 'La sesión de seguridad expiró. Recarga la página e inténtalo de nuevo.'))
    }
  })

  app.setErrorHandler(manejarError)
  app.setNotFoundHandler((_req, reply) => reply.status(404).send(cuerpoError('NO_ENCONTRADO', 'Ruta no encontrada')))

  return app
}

/** Resuelve (una vez por petición) quién hace la solicitud a partir de la cookie de acceso. */
export function actorDe(req: FastifyRequest, c: Contenedor, env: Env): Promise<Actor> {
  req.actorResuelto ??= (async (): Promise<Actor> => {
    const token = leerCookie(req, nombresCookies(env.COOKIE_SECURE).acceso)
    if (!token) return { tipo: 'invitado' }
    try {
      const claims = await c.tokens.verificarAcceso(token)
      const sesion = await c.uow.repos.sesiones.porId(claims.sid)
      const ahora = c.reloj.ahora()
      if (!sesion || sesion.revocadaEn || sesion.expiraEn <= ahora || sesion.usuarioId !== claims.sub) return { tipo: 'invitado' }
      return { tipo: 'usuario', id: claims.sub, rol: claims.rol, sedeId: claims.sede, sesionId: claims.sid }
    } catch {
      return { tipo: 'invitado' }
    }
  })()
  return req.actorResuelto
}

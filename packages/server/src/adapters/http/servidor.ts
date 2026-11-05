import type { Env } from '../../config/env'
import { origenesPermitidos } from '../../config/env'
import type { Actor } from '../../domain/permisos'
import type { Contenedor } from '../../contenedor'
import type { Logger } from '../../ports/servicios'
import { leerCookie, nombresCookies } from './cookies'
import { cuerpoError, manejarError } from './errores'
import { limitadorMemoria, segundosDeVentana } from './limitador'
import { ErrorHttp, Respuesta, Router, type Peticion } from './router'

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface OpcionesServidor {
  env: Env
  c: Contenedor
  log: Logger
}

/** Origen propio de la petición (la web y la API comparten dominio, también en los despliegues de vista previa). */
function origenPropio(req: Peticion): string | null {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  if (!host) return null
  const proto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() ?? req.url.protocol.replace(':', '')
  return `${proto}://${host}`
}

export function crearServidor({ env, c, log }: OpcionesServidor): Router {
  const permitidos = origenesPermitidos(env)
  const nombres = nombresCookies(env.COOKIE_SECURE)
  const global = limitadorMemoria()

  const origenValido = (req: Peticion, origen: string) => permitidos.includes(origen) || origen === origenPropio(req)

  return new Router(
    {
      async antes(req) {
        // --- Límites: global (memoria) y por ruta (PostgreSQL) --------------------------------------
        if (!global(`g:${req.ipCliente}`, 300, 60_000)) throw new ErrorHttp(429, 'Demasiadas solicitudes')
        const limite = req.config.rateLimit
        if (limite) {
          const entra = await c.limitador.golpear(`${req.method}:${req.patron}:${req.ipCliente}`, limite.max, segundosDeVentana(limite.timeWindow))
          if (!entra) throw new ErrorHttp(429, 'Demasiadas solicitudes')
        }

        // --- CSRF: verificación de origen + token de doble envío ---------------------------------------
        if (METODOS_SEGUROS.has(req.method) || req.config.csrf === false) return
        const origen = req.headers.origin
        const sitio = req.headers['sec-fetch-site']
        if ((origen && !origenValido(req, origen)) || (!origen && sitio === 'cross-site')) {
          return new Respuesta().status(403).send(cuerpoError('ORIGEN_NO_PERMITIDO', 'Origen no permitido'))
        }
        const enCookie = leerCookie(req, nombres.csrf)
        const enCabecera = req.headers['x-csrf-token']
        if (!enCookie || typeof enCabecera !== 'string' || !c.cripto.compararSeguro(enCookie, enCabecera)) {
          return new Respuesta().status(403).send(cuerpoError('CSRF', 'La sesión de seguridad expiró. Recarga la página e inténtalo de nuevo.'))
        }
      },
      error: (e, req) => manejarError(e, req),
      alEnviar(res) {
        // Nada de la API se guarda en cachés del navegador o intermedias salvo que la ruta lo pida (ASVS: datos en el cliente).
        if (!res.hasHeader('cache-control')) res.header('cache-control', 'no-store')
        res.header('x-content-type-options', 'nosniff')
        res.header('referrer-policy', 'no-referrer')
        res.header('cross-origin-resource-policy', 'same-origin')
        // La API solo devuelve JSON/PDF: CSP mínima que no permite nada.
        if (!res.hasHeader('content-security-policy')) res.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
      },
      alTerminar: () => c.eventos.vaciar(),
      noEncontrada: () => new Respuesta().status(404).send(cuerpoError('NO_ENCONTRADO', 'Ruta no encontrada')),
    },
    log,
  )
}

/** Resuelve (una vez por petición) quién hace la solicitud a partir de la cookie de acceso. */
export function actorDe(req: Peticion, c: Contenedor, env: Env): Promise<Actor> {
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

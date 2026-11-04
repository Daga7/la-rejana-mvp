import type { FastifyReply, FastifyRequest } from 'fastify'

export interface ConfigCookies {
  seguras: boolean
}

/** Nombres con prefijo __Host- en producción: solo HTTPS, sin Domain y con Path=/ (no se pueden inyectar desde subdominios). */
export function nombresCookies(seguras: boolean) {
  const p = seguras ? '__Host-' : ''
  return {
    acceso: `${p}rj_at`,
    refresco: `${p}rj_rt`,
    csrf: `${p}rj_csrf`,
    oauth: `${p}rj_oauth`,
  }
}

export const MINUTOS_ACCESO = 15
export const DIAS_SESION = 30

export function ponerSesion(reply: FastifyReply, cfg: ConfigCookies, acceso: string, refresco: string, expiraSesion: Date) {
  const n = nombresCookies(cfg.seguras)
  reply.setCookie(n.acceso, acceso, { httpOnly: true, secure: cfg.seguras, sameSite: 'strict', path: '/', maxAge: MINUTOS_ACCESO * 60 })
  reply.setCookie(n.refresco, refresco, { httpOnly: true, secure: cfg.seguras, sameSite: 'strict', path: '/', expires: expiraSesion })
}

export function borrarSesion(reply: FastifyReply, cfg: ConfigCookies) {
  const n = nombresCookies(cfg.seguras)
  reply.clearCookie(n.acceso, { path: '/', secure: cfg.seguras, sameSite: 'strict', httpOnly: true })
  reply.clearCookie(n.refresco, { path: '/', secure: cfg.seguras, sameSite: 'strict', httpOnly: true })
}

export function leerCookie(req: FastifyRequest, nombre: string): string | undefined {
  const v = req.cookies[nombre]
  return v && v.length < 4096 ? v : undefined
}

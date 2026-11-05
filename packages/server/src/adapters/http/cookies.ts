import type { Peticion } from './router'

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

export interface OpcionesCookie {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  path?: string
  maxAge?: number
  expires?: Date
}

export function serializarCookie(nombre: string, valor: string, o: OpcionesCookie = {}): string {
  const partes = [`${nombre}=${encodeURIComponent(valor)}`]
  if (o.maxAge !== undefined) partes.push(`Max-Age=${Math.floor(o.maxAge)}`)
  if (o.expires) partes.push(`Expires=${o.expires.toUTCString()}`)
  partes.push(`Path=${o.path ?? '/'}`)
  if (o.httpOnly) partes.push('HttpOnly')
  if (o.secure) partes.push('Secure')
  if (o.sameSite) partes.push(`SameSite=${o.sameSite[0]!.toUpperCase()}${o.sameSite.slice(1)}`)
  return partes.join('; ')
}

export function leerCookies(cabecera: string | undefined): Record<string, string> {
  const r: Record<string, string> = {}
  if (!cabecera) return r
  for (const par of cabecera.split(';')) {
    const i = par.indexOf('=')
    if (i < 1) continue
    const nombre = par.slice(0, i).trim()
    if (nombre in r) continue
    try {
      r[nombre] = decodeURIComponent(par.slice(i + 1).trim())
    } catch {
      r[nombre] = par.slice(i + 1).trim()
    }
  }
  return r
}

type ReplyCookies = { setCookie(n: string, v: string, o?: OpcionesCookie): unknown; clearCookie(n: string, o?: OpcionesCookie): unknown }

export function ponerSesion(reply: ReplyCookies, cfg: ConfigCookies, acceso: string, refresco: string, expiraSesion: Date) {
  const n = nombresCookies(cfg.seguras)
  reply.setCookie(n.acceso, acceso, { httpOnly: true, secure: cfg.seguras, sameSite: 'strict', path: '/', maxAge: MINUTOS_ACCESO * 60 })
  reply.setCookie(n.refresco, refresco, { httpOnly: true, secure: cfg.seguras, sameSite: 'strict', path: '/', expires: expiraSesion })
}

export function borrarSesion(reply: ReplyCookies, cfg: ConfigCookies) {
  const n = nombresCookies(cfg.seguras)
  reply.clearCookie(n.acceso, { path: '/', secure: cfg.seguras, sameSite: 'strict', httpOnly: true })
  reply.clearCookie(n.refresco, { path: '/', secure: cfg.seguras, sameSite: 'strict', httpOnly: true })
}

export function leerCookie(req: Pick<Peticion, 'cookies'>, nombre: string): string | undefined {
  const v = req.cookies[nombre]
  return v && v.length < 4096 ? v : undefined
}

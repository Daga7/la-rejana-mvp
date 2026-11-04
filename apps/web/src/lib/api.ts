// Cliente HTTP del frontend. Todas las llamadas van al mismo origen (/api/*), que reenvía a la API.

export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly campos?: Record<string, string[]>,
    readonly detalles?: Record<string, unknown>,
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
  }
}

let csrf: string | null = null
let pidiendoCsrf: Promise<string> | null = null

/** El token CSRF vive en memoria (no en una cookie legible por JS); se pide una vez por carga. */
async function tokenCsrf(forzar = false): Promise<string> {
  if (csrf && !forzar) return csrf
  pidiendoCsrf ??= fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
    .then(async (r) => {
      if (!r.ok) throw new ErrorApi(r.status, 'SIN_CONEXION_API', 'No pudimos conectarnos con el servidor')
      const j = (await r.json()) as { token: string }
      csrf = j.token
      return j.token
    })
    .finally(() => {
      pidiendoCsrf = null
    })
  return pidiendoCsrf
}

let refrescando: Promise<boolean> | null = null

/** Rota la sesión con el refresh token. Varias peticiones simultáneas comparten un solo intento. */
export function refrescarSesion(): Promise<boolean> {
  refrescando ??= (async () => {
    try {
      const r = await fetch('/api/auth/refrescar', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': await tokenCsrf() } })
      return r.ok
    } catch {
      return false
    } finally {
      setTimeout(() => (refrescando = null), 0)
    }
  })()
  return refrescando
}

/** Pista no sensible que deja la API para saber si vale la pena consultar la sesión. */
export function haySesionProbable(): boolean {
  return typeof document !== 'undefined' && /(?:^|;\s*)(?:__Host-)?rj_hay_sesion=1/.test(document.cookie)
}

export interface OpcionesApi {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  cuerpo?: unknown
  cabeceras?: Record<string, string>
  senal?: AbortSignal
  /** Interno: evita bucles de reintento. */
  reintento?: boolean
}

export async function api<T>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const metodo = opciones.metodo ?? 'GET'
  const cabeceras: Record<string, string> = { accept: 'application/json', ...opciones.cabeceras }
  if (opciones.cuerpo !== undefined) cabeceras['content-type'] = 'application/json'
  if (metodo !== 'GET') cabeceras['x-csrf-token'] = await tokenCsrf()

  let res: Response
  try {
    res = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opciones.senal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ErrorApi(0, 'SIN_CONEXION', 'Sin conexión. Revisa tu internet e inténtalo de nuevo.')
  }

  if (!opciones.reintento) {
    if (res.status === 401 && !ruta.startsWith('/auth/refrescar') && !ruta.startsWith('/auth/ingresar')) {
      if (await refrescarSesion()) return api<T>(ruta, { ...opciones, reintento: true })
    }
    if (res.status === 403) {
      const copia = res.clone()
      const j = (await copia.json().catch(() => null)) as { error?: { codigo?: string } } | null
      if (j?.error?.codigo === 'CSRF') {
        await tokenCsrf(true)
        return api<T>(ruta, { ...opciones, reintento: true })
      }
    }
  }

  if (res.status === 204) return undefined as T
  const tipo = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    const j = tipo.includes('json') ? ((await res.json().catch(() => null)) as { error?: { codigo: string; mensaje: string; campos?: Record<string, string[]>; detalles?: Record<string, unknown> } } | null) : null
    throw new ErrorApi(res.status, j?.error?.codigo ?? 'ERROR', j?.error?.mensaje ?? 'Algo salió mal. Inténtalo de nuevo.', j?.error?.campos, j?.error?.detalles)
  }
  if (tipo.includes('json')) return (await res.json()) as T
  return (await res.blob()) as T
}

/** Fetcher para SWR. */
export const obtener = <T,>(ruta: string) => api<T>(ruta)

export function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi) return e.message
  return 'Algo salió mal. Inténtalo de nuevo.'
}

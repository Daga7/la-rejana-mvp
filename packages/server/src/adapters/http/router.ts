import type { Actor } from '../../domain/permisos'
import type { Logger } from '../../ports/servicios'
import { leerCookies, serializarCookie, type OpcionesCookie } from './cookies'
import { ipDelCliente } from './ip'

/**
 * Enrutador mínimo sobre las APIs web estándar (Request/Response). Reemplaza a Fastify para que la API corra
 * dentro de los route handlers de Next.js (Vercel). Mantiene la forma `app.get(ruta, opciones, (req, reply) => …)`
 * para que las rutas no cambien de estructura.
 */

// El alias global `BodyInit` no está disponible con lib ES2023 (sin DOM); se deriva del propio
// constructor de `Response`, que sí es un global de runtime en Node, para que el tipo funcione
// tanto si este paquete se compila solo como si lo hace dentro del programa de Next.js (con DOM).
type CuerpoWeb = ConstructorParameters<typeof Response>[0]

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ConfigRuta {
  /** false para rutas que no usan cookies de sesión (webhooks, callback de Apple). */
  csrf?: boolean
  rateLimit?: { max: number; timeWindow: string }
}
export interface OpcionesRuta {
  config?: ConfigRuta
}

export class ErrorHttp extends Error {
  constructor(
    readonly statusCode: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

export class Peticion {
  params: Record<string, string> = {}
  query: Record<string, string | undefined> = {}
  body: unknown = undefined
  /** Cuerpo crudo (necesario para verificar firmas de webhooks). */
  cuerpoCrudo?: Buffer
  actorResuelto?: Promise<Actor>
  config: ConfigRuta = {}
  /** Patrón de la ruta resuelta (clave estable para el límite de solicitudes). */
  patron = ''
  readonly cookies: Record<string, string>
  readonly ipCliente: string

  constructor(
    readonly method: Metodo,
    readonly url: URL,
    readonly headers: Record<string, string | undefined>,
    readonly log: Logger,
    private readonly encolar: (tarea: Promise<unknown>) => void,
  ) {
    this.cookies = leerCookies(headers.cookie)
    this.ipCliente = ipDelCliente(headers)
  }

  /** Trabajo que debe terminar aunque la respuesta ya se haya enviado (en Vercel se ata a `after`). */
  despues(tarea: Promise<unknown>) {
    this.encolar(tarea.catch((e: unknown) => this.log.error({ err: (e as Error).message }, 'Fallo en una tarea en segundo plano')))
  }
}

export class Respuesta {
  statusCode = 200
  readonly cabeceras = new Headers()
  readonly cookies: string[] = []
  cuerpo: unknown = undefined
  enviada = false

  status(codigo: number) {
    this.statusCode = codigo
    return this
  }
  header(nombre: string, valor: string) {
    this.cabeceras.set(nombre, valor)
    return this
  }
  hasHeader(nombre: string) {
    return this.cabeceras.has(nombre)
  }
  type(tipo: string) {
    return this.header('content-type', tipo)
  }
  setCookie(nombre: string, valor: string, opciones?: OpcionesCookie) {
    this.cookies.push(serializarCookie(nombre, valor, opciones))
    return this
  }
  clearCookie(nombre: string, opciones?: OpcionesCookie) {
    this.cookies.push(serializarCookie(nombre, '', { ...opciones, maxAge: 0, expires: new Date(0) }))
    return this
  }
  redirect(url: string, codigo = 302) {
    this.statusCode = codigo
    this.header('location', url)
    this.enviada = true
    return this
  }
  send(cuerpo?: unknown) {
    this.cuerpo = cuerpo
    this.enviada = true
    return this
  }
  /** Respuesta en streaming (p. ej. Server-Sent Events): el cuerpo sigue escribiendo después de devolver la Response. */
  stream(cuerpo: ReadableStream) {
    this.cuerpo = cuerpo
    this.enviada = true
    return this
  }

  aWeb(): Response {
    const h = new Headers(this.cabeceras)
    for (const c of this.cookies) h.append('set-cookie', c)
    const c = this.cuerpo
    if (c instanceof ReadableStream) return new Response(c, { status: this.statusCode, headers: h })
    const sinCuerpo = c === undefined || this.statusCode === 204 || this.statusCode === 304 || (this.statusCode >= 300 && this.statusCode < 400)
    if (sinCuerpo) return new Response(null, { status: this.statusCode, headers: h })
    if (c instanceof Uint8Array) return new Response(c as unknown as CuerpoWeb, { status: this.statusCode, headers: h })
    if (typeof c === 'string') {
      if (!h.has('content-type')) h.set('content-type', 'text/plain; charset=utf-8')
      return new Response(c, { status: this.statusCode, headers: h })
    }
    h.set('content-type', 'application/json; charset=utf-8')
    return new Response(JSON.stringify(c), { status: this.statusCode, headers: h })
  }
}

export type Manejador = (req: Peticion, reply: Respuesta) => unknown | Promise<unknown>

export interface Ganchos {
  /** Antes del manejador (CSRF, límites). Si devuelve una respuesta, se corta ahí. */
  antes(req: Peticion): Promise<Respuesta | void>
  /** Convierte un error en respuesta. */
  error(e: unknown, req: Peticion): Respuesta
  /** Ajustes finales de cabeceras. */
  alEnviar(res: Respuesta): void
  /** Se espera antes de devolver la respuesta (p. ej. publicar eventos en tiempo real). */
  alTerminar(): Promise<void>
  noEncontrada(): Respuesta
}

interface Ruta {
  metodo: Metodo
  patron: string
  segmentos: string[]
  opciones: OpcionesRuta
  manejador: Manejador
}

const LIMITE_CUERPO = 256 * 1024

export class Router {
  private rutas: Ruta[] = []
  constructor(
    private readonly ganchos: Ganchos,
    private readonly log: Logger,
  ) {}

  private agregar(metodo: Metodo, patron: string, a: OpcionesRuta | Manejador, b?: Manejador) {
    const manejador = typeof a === 'function' ? a : b!
    const opciones = typeof a === 'function' ? {} : a
    this.rutas.push({ metodo, patron, segmentos: patron.split('/').filter(Boolean), opciones, manejador })
  }
  get(p: string, a: OpcionesRuta | Manejador, b?: Manejador) {
    this.agregar('GET', p, a, b)
  }
  post(p: string, a: OpcionesRuta | Manejador, b?: Manejador) {
    this.agregar('POST', p, a, b)
  }
  put(p: string, a: OpcionesRuta | Manejador, b?: Manejador) {
    this.agregar('PUT', p, a, b)
  }
  patch(p: string, a: OpcionesRuta | Manejador, b?: Manejador) {
    this.agregar('PATCH', p, a, b)
  }
  delete(p: string, a: OpcionesRuta | Manejador, b?: Manejador) {
    this.agregar('DELETE', p, a, b)
  }

  /** Entre las rutas que coinciden gana la más específica (más segmentos fijos), como en Fastify. */
  private buscar(metodo: string, ruta: string): { ruta: Ruta; params: Record<string, string> } | null {
    const partes = ruta.split('/').filter(Boolean)
    let mejor: { ruta: Ruta; params: Record<string, string>; fijos: number } | null = null
    for (const r of this.rutas) {
      if (r.metodo !== metodo || r.segmentos.length !== partes.length) continue
      const params: Record<string, string> = {}
      let fijos = 0
      let ok = true
      for (let i = 0; i < partes.length; i++) {
        const s = r.segmentos[i]!
        if (s.startsWith(':')) {
          try {
            params[s.slice(1)] = decodeURIComponent(partes[i]!)
          } catch {
            ok = false
            break
          }
        } else if (s === partes[i]) fijos++
        else {
          ok = false
          break
        }
      }
      if (ok && (!mejor || fijos > mejor.fijos)) mejor = { ruta: r, params, fijos }
    }
    return mejor
  }

  private async leerCuerpo(request: Request, req: Peticion) {
    if (req.method === 'GET') return
    const declarado = Number(req.headers['content-length'] ?? 0)
    if (declarado > LIMITE_CUERPO) throw new ErrorHttp(413, 'La solicitud es demasiado grande')
    const buf = Buffer.from(await request.arrayBuffer())
    if (buf.length > LIMITE_CUERPO) throw new ErrorHttp(413, 'La solicitud es demasiado grande')
    req.cuerpoCrudo = buf
    const tipo = (req.headers['content-type'] ?? '').toLowerCase()
    if (tipo.startsWith('application/json')) {
      if (buf.length === 0) req.body = {}
      else {
        try {
          req.body = JSON.parse(buf.toString('utf8'))
        } catch {
          throw new ErrorHttp(400, 'JSON inválido')
        }
      }
    } else if (tipo.startsWith('application/x-www-form-urlencoded')) {
      // Formulario de Sign in with Apple (response_mode=form_post).
      req.body = Object.fromEntries(new URLSearchParams(buf.toString('utf8')))
    }
  }

  async handle(request: Request, opciones: { despues?: (tarea: Promise<unknown>) => void } = {}): Promise<Response> {
    const url = new URL(request.url)
    const cabeceras: Record<string, string | undefined> = {}
    request.headers.forEach((v, k) => (cabeceras[k] = v))
    const metodo = request.method.toUpperCase() as Metodo
    const req = new Peticion(metodo, url, cabeceras, this.log, (t) => opciones.despues?.(t))
    url.searchParams.forEach((v, k) => {
      if (!(k in req.query)) req.query[k] = v
    })

    let res: Respuesta
    try {
      const m = this.buscar(metodo, url.pathname)
      if (!m) res = this.ganchos.noEncontrada()
      else {
        req.params = m.params
        req.config = m.ruta.opciones.config ?? {}
        req.patron = m.ruta.patron
        await this.leerCuerpo(request, req)
        const corte = await this.ganchos.antes(req)
        if (corte) res = corte
        else {
          const reply = new Respuesta()
          const r = await m.ruta.manejador(req, reply)
          if (r !== reply && r !== undefined && !reply.enviada) reply.send(r)
          else if (!reply.enviada) reply.status(204)
          res = reply
        }
      }
    } catch (e) {
      res = this.ganchos.error(e, req)
    }
    this.ganchos.alEnviar(res)
    await this.ganchos.alTerminar()
    return res.aWeb()
  }

  /** Simula una petición completa (pruebas). Espera también las tareas en segundo plano. */
  async inject(o: { method: Metodo; url: string; payload?: unknown; headers?: Record<string, string> }) {
    const cab = new Headers(o.headers)
    let cuerpo: Uint8Array | string | undefined
    if (o.payload !== undefined) {
      if (typeof o.payload === 'string' || Buffer.isBuffer(o.payload)) cuerpo = o.payload as Uint8Array | string
      else {
        cuerpo = JSON.stringify(o.payload)
        if (!cab.has('content-type')) cab.set('content-type', 'application/json')
      }
    }
    const pendientes: Promise<unknown>[] = []
    const r = await this.handle(new Request(new URL(o.url, 'http://localhost:3000'), { method: o.method, headers: cab, body: cuerpo as CuerpoWeb, redirect: 'manual' }), {
      despues: (t) => void pendientes.push(t),
    })
    await Promise.allSettled(pendientes)
    const rawPayload = Buffer.from(await r.arrayBuffer())
    const headers: Record<string, string | string[] | undefined> = {}
    r.headers.forEach((v, k) => {
      if (k !== 'set-cookie') headers[k] = v
    })
    const sc = r.headers.getSetCookie()
    if (sc.length) headers['set-cookie'] = sc
    const body = rawPayload.toString('utf8')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { statusCode: r.status, headers, body, rawPayload, json: <T = any>() => JSON.parse(body) as T }
  }
}

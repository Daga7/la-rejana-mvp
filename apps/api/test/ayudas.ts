import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crearApp } from '../src/app'
import { cargarEnv, type Env } from '../src/config/env'
import { crearContenedor, type Contenedor } from '../src/contenedor'
import { sembrar } from '../src/adapters/db/seed'
import { hasherBcrypt } from '../src/adapters/seguridad/hasher-bcrypt'
import { verificarFirmaMeta } from '../src/adapters/whatsapp/whatsapp'
import type { MensajeCorreo, Notificador, NotificacionPush } from '../src/ports/servicios'

export const SECRETO_WHATSAPP = 'secreto-app-whatsapp-pruebas'

export const ORIGEN_WEB = 'http://localhost:3000'
export const CLAVE = 'Rejana2026*'

export interface Entorno {
  app: FastifyInstance
  c: Contenedor
  correos: MensajeCorreo[]
  whatsapp: { para: string; texto?: string; pdf?: Buffer; nombre?: string }[]
  pushes: { endpoint: string; n: NotificacionPush }[]
  reloj: { t: number; avanzar(ms: number): void }
  cerrar(): Promise<void>
}

export function envPrueba(extra: Partial<Record<string, string>> = {}): Env {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('Define DATABASE_URL_TEST para las pruebas de integración')
  return cargarEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    WEB_ORIGIN: ORIGEN_WEB,
    API_PUBLIC_URL: 'http://localhost:4000',
    JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres-1',
    TOKENS_PEPPER: 'secreto-de-pruebas-con-mas-de-32-caracteres-2',
    PROXY_SHARED_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres-3',
    COOKIE_SECURE: 'false',
    EMAIL_PROVEEDOR: 'consola',
    OAUTH_MOCK: 'true',
    GOOGLE_CLIENT_ID: '',
    APPLE_CLIENT_ID: '',
    WHATSAPP_PROVEEDOR: 'consola',
    WHATSAPP_APP_SECRET: 'secreto-app-whatsapp-pruebas',
    WHATSAPP_VERIFY_TOKEN: 'token-verificacion-pruebas',
    IA_PROVEEDOR: 'reglas',
    STT_PROVEEDOR: 'mock',
    MAPAS_PROVEEDOR: 'haversine',
    GEOCODER: 'ninguno',
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    LOG_LEVEL: 'silent',
    PERMITIR_PEDIDOS_FUERA_DE_HORARIO: 'true',
    ...extra,
  })
}

/** Levanta la app completa contra la base de pruebas, con correo y push capturados y reloj controlable. */
export async function levantar(opciones: { sembrar?: boolean; env?: Partial<Record<string, string>> } = {}): Promise<Entorno> {
  const correos: MensajeCorreo[] = []
  const pushes: Entorno['pushes'] = []
  const whatsapp: Entorno['whatsapp'] = []
  const reloj = {
    t: Date.now(),
    avanzar(ms: number) {
      this.t += ms
    },
  }
  const push: Notificador = {
    clavePublica: 'clave-publica-prueba',
    async enviar(d, n) {
      pushes.push({ endpoint: d.endpoint, n })
      return d.endpoint.includes('expirada') ? 'expirada' : 'ok'
    },
  }
  const env = envPrueba(opciones.env)
  const { app, c, cerrar } = await crearApp(env, crearContenedor, {
    silencioso: true,
    sobrescrituras: {
      reloj: { ahora: () => new Date(reloj.t) },
      correo: { enviar: async (m) => void correos.push(m) },
      hasher: hasherBcrypt(4), // solo pruebas: el costo real (12) se usa en la app
      filtradas: { estaFiltrada: async (clave) => clave === 'Filtrada.2026!' },
      push,
      whatsapp: {
        async enviarTexto(para, texto) {
          whatsapp.push({ para, texto })
        },
        async enviarDocumento(para, pdf, nombre, leyenda) {
          whatsapp.push({ para, pdf, nombre, texto: leyenda })
        },
        async descargarMedia(id) {
          if (id === 'audio-roto') throw new Error('no se pudo descargar')
          return { datos: Buffer.from('audio falso'), mime: 'audio/ogg; codecs=opus' }
        },
        firmaValida: (cuerpo, firma) => verificarFirmaMeta(SECRETO_WHATSAPP, cuerpo, firma),
      },
      stt: { transcribir: async () => '¿Cuánto inventario de pan hay en la sede de Villaluz?' },
    },
  })
  await limpiar(c)
  if (opciones.sembrar !== false) await sembrar(c.conexion.db, { pimienta: env.TOKENS_PEPPER, historicoDias: 2, silencioso: true })
  return { app, c, correos, whatsapp, pushes, reloj, cerrar }
}

export async function limpiar(c: Contenedor) {
  const tablas = await c.conexion.db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`)
  const nombres = tablas.rows.map((t) => `"${t.tablename}"`).join(', ')
  if (nombres) await c.conexion.db.execute(sql.raw(`truncate ${nombres} restart identity cascade`))
}

/** Cliente HTTP con "frasco" de cookies, token CSRF y cabecera Origin, como un navegador. */
export class Navegador {
  cookies = new Map<string, string>()
  private csrf: string | null = null
  constructor(
    private app: FastifyInstance,
    readonly ip = `198.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`,
  ) {}

  private cabeceraCookies() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  private guardar(setCookie: string | string[] | undefined) {
    for (const linea of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
      const [par, ...atributos] = linea.split(';')
      const i = par!.indexOf('=')
      const nombre = par!.slice(0, i).trim()
      const valor = par!.slice(i + 1).trim()
      const expira = atributos.find((a) => /expires=/i.test(a))
      const maxAge = atributos.find((a) => /max-age=/i.test(a))
      const borrar = valor === '' || (maxAge && Number(maxAge.split('=')[1]) <= 0) || (expira && new Date(expira.split('=')[1]!).getTime() < Date.now())
      if (borrar) this.cookies.delete(nombre)
      else this.cookies.set(nombre, valor)
    }
  }

  async pedir(metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}) {
    if (metodo !== 'GET' && !this.csrf && !('x-csrf-token' in cabeceras)) {
      const r = await this.app.inject({
        method: 'GET',
        url: '/api/auth/csrf',
        headers: { cookie: this.cabeceraCookies(), 'x-rejana-client-ip': this.ip, 'x-rejana-proxy-secret': 'secreto-de-pruebas-con-mas-de-32-caracteres-3' },
      })
      this.guardar(r.headers['set-cookie'])
      this.csrf = r.json<{ token: string }>().token
    }
    const r = await this.app.inject({
      method: metodo,
      url,
      payload: cuerpo === undefined ? undefined : (cuerpo as object),
      headers: {
        cookie: this.cabeceraCookies(),
        origin: ORIGEN_WEB,
        'x-rejana-client-ip': this.ip,
        'x-rejana-proxy-secret': 'secreto-de-pruebas-con-mas-de-32-caracteres-3',
        ...(metodo !== 'GET' && this.csrf ? { 'x-csrf-token': this.csrf } : {}),
        ...cabeceras,
      },
    })
    this.guardar(r.headers['set-cookie'])
    return r
  }
  get = (url: string, cabeceras?: Record<string, string>) => this.pedir('GET', url, undefined, cabeceras)
  post = (url: string, cuerpo?: unknown, cabeceras?: Record<string, string>) => this.pedir('POST', url, cuerpo ?? {}, cabeceras)
  patch = (url: string, cuerpo?: unknown) => this.pedir('PATCH', url, cuerpo ?? {})
  put = (url: string, cuerpo?: unknown) => this.pedir('PUT', url, cuerpo ?? {})
  delete = (url: string) => this.pedir('DELETE', url)

  /** Inicia sesión con un usuario de prueba del seed. */
  async ingresar(correo: string, clave = CLAVE) {
    const r = await this.post('/api/auth/ingresar', { correo, clave })
    if (r.statusCode !== 200) throw new Error(`No se pudo ingresar como ${correo}: ${r.body}`)
    return r.json<{ usuario: { id: string; rol: string; sedeId: string | null } }>().usuario
  }
}

export function codigoDe(m: MensajeCorreo): string {
  const c = /\b(\d{6})\b/.exec(m.texto)?.[1]
  if (!c) throw new Error(`El correo no trae código: ${m.asunto}`)
  return c
}

/** Las ids de sedes/productos del seed por slug/nombre. */
export async function idsSeed(c: Contenedor) {
  const sedes = await c.uow.repos.sedes.todas(false)
  const productos = await c.uow.repos.catalogo.productos()
  const insumos = await c.uow.repos.inventario.insumos(false)
  return {
    villaluz: sedes.find((s) => s.slug === 'villaluz')!.id,
    normandia: sedes.find((s) => s.slug === 'normandia')!.id,
    producto: (slug: string) => productos.find((p) => p.slug === slug)!.id,
    insumo: (nombre: string) => insumos.find((i) => i.nombre === nombre)!.id,
  }
}

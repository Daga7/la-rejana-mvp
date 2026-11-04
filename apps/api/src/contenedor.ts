import { createHmac } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import type { ProveedorOAuth } from '@rejana/shared'
import type { Env } from './config/env'
import { crearCasosAuth } from './application/auth'
import { crearCasosDomicilios, type CasosDomicilios } from './application/domicilios'
import { crearCasosInventario } from './application/inventario'
import { crearCasosMenu } from './application/menu'
import { crearCasosPedidos } from './application/pedidos'
import { crearCasosPush } from './application/push'
import { proveedorApple, proveedorGoogle, proveedorSimulado } from './adapters/oauth/proveedores'
import { conectarBD, type ConexionBD } from './adapters/db/cliente'
import { unidadDeTrabajoPostgres } from './adapters/db/repos'
import { correoConsola, correoResend, correoSmtp } from './adapters/correo/correo'
import { geocoderGoogle, geocoderNinguno, geocoderNominatim, matrizGoogle, matrizHaversine, matrizOsrm } from './adapters/mapas/mapas'
import { notificadorConsola, notificadorWebPush } from './adapters/push/web-push'
import { PublicadorSocketIo } from './adapters/realtime/publicador'
import { criptografiaNode } from './adapters/seguridad/criptografia'
import { hasherBcrypt } from './adapters/seguridad/hasher-bcrypt'
import { verificadorHibp } from './adapters/seguridad/hibp'
import { emisorTokensJose } from './adapters/seguridad/tokens-jose'
import type { UnidadDeTrabajo } from './ports/repositorios'
import type {
  Criptografia,
  EmisorTokens,
  Geocodificador,
  HasherClaves,
  Logger,
  MatrizTiempos,
  Notificador,
  PerfilOAuth,
  ProveedorIdentidad,
  Reloj,
  ServicioCorreo,
  VerificadorClavesFiltradas,
} from './ports/servicios'

/**
 * Raíz de composición: aquí (y solo aquí) se decide qué adaptador concreto implementa cada puerto,
 * según las variables de entorno. Cambiar de proveedor no toca el dominio ni los casos de uso.
 */
export interface Contenedor {
  env: Env
  conexion: ConexionBD
  uow: UnidadDeTrabajo
  log: Logger
  reloj: Reloj
  cripto: Criptografia
  hasher: HasherClaves
  filtradas: VerificadorClavesFiltradas
  tokens: EmisorTokens
  correo: ServicioCorreo
  push: Notificador
  eventos: PublicadorSocketIo
  mapas: MatrizTiempos
  geocoder: Geocodificador
  proveedores: Partial<Record<ProveedorOAuth, ProveedorIdentidad>>
  /** Solo con OAUTH_MOCK: firma el "código" del proveedor simulado. */
  firmarCodigoSimulado: ((p: PerfilOAuth & { nonce: string }) => Promise<string>) | null
  casos: Casos
}

export interface Casos {
  auth: ReturnType<typeof crearCasosAuth>
  menu: ReturnType<typeof crearCasosMenu>
  inventario: ReturnType<typeof crearCasosInventario>
  pedidos: ReturnType<typeof crearCasosPedidos>
  push: ReturnType<typeof crearCasosPush>
  domicilios: CasosDomicilios
}

export interface Sobrescrituras {
  reloj?: Reloj
  correo?: ServicioCorreo
  hasher?: HasherClaves
  filtradas?: VerificadorClavesFiltradas
  push?: Notificador
  mapas?: MatrizTiempos
}

export function crearContenedor(env: Env, log: Logger, s: Sobrescrituras = {}): Contenedor {
  const conexion = conectarBD(env.DATABASE_URL, { ssl: env.DATABASE_SSL })
  const uow = unidadDeTrabajoPostgres(conexion.db)

  const correo =
    s.correo ??
    (env.EMAIL_PROVEEDOR === 'smtp'
      ? correoSmtp({ host: env.SMTP_HOST!, puerto: env.SMTP_PORT, seguro: env.SMTP_SECURE, usuario: env.SMTP_USUARIO, clave: env.SMTP_CLAVE, remitente: env.EMAIL_REMITENTE })
      : env.EMAIL_PROVEEDOR === 'resend'
        ? correoResend(env.RESEND_API_KEY!, env.EMAIL_REMITENTE)
        : correoConsola(log))

  const push =
    s.push ??
    (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? notificadorWebPush({ publica: env.VAPID_PUBLIC_KEY, privada: env.VAPID_PRIVATE_KEY, sujeto: env.VAPID_SUBJECT }, log)
      : notificadorConsola(log))

  const lineaRecta = matrizHaversine(env.VELOCIDAD_PROMEDIO_KMH)
  const mapas =
    s.mapas ??
    (env.MAPAS_PROVEEDOR === 'osrm'
      ? matrizOsrm(env.OSRM_URL, lineaRecta, log)
      : env.MAPAS_PROVEEDOR === 'google'
        ? matrizGoogle(env.GOOGLE_MAPS_API_KEY!, lineaRecta, log)
        : lineaRecta)

  const geocoder =
    env.GEOCODER === 'google' ? geocoderGoogle(env.GOOGLE_MAPS_API_KEY!, log) : env.GEOCODER === 'nominatim' ? geocoderNominatim(env.NOMINATIM_URL, log) : geocoderNinguno

  // --- Identidad externa: reales si hay credenciales; simulados solo en desarrollo ---------------
  const proveedores: Partial<Record<ProveedorOAuth, ProveedorIdentidad>> = {}
  let firmarCodigoSimulado: Contenedor['firmarCodigoSimulado'] = null
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) proveedores.google = proveedorGoogle(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
  if (env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY) {
    proveedores.apple = proveedorApple({ clientId: env.APPLE_CLIENT_ID, teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_KEY_ID, llavePrivada: env.APPLE_PRIVATE_KEY })
  }
  if (env.OAUTH_MOCK && env.NODE_ENV !== 'production') {
    const llave = new Uint8Array(createHmac('sha256', env.JWT_SECRET).update('rejana:oauth-simulado').digest())
    const firmar = (p: PerfilOAuth & { nonce: string }) =>
      new SignJWT({ ...p }).setProtectedHeader({ alg: 'HS256' }).setAudience('oauth-simulado').setIssuedAt().setExpirationTime('2m').sign(llave)
    const verificar = async (code: string) => (await jwtVerify(code, llave, { audience: 'oauth-simulado', algorithms: ['HS256'] })).payload as unknown as PerfilOAuth & { nonce: string }
    firmarCodigoSimulado = firmar
    for (const p of ['google', 'apple'] as const) proveedores[p] ??= proveedorSimulado(p, firmar, verificar, env.WEB_ORIGIN)
  }

  const reloj = s.reloj ?? { ahora: () => new Date() }
  const cripto = criptografiaNode(env.TOKENS_PEPPER)
  const hasher = s.hasher ?? hasherBcrypt(12)
  const filtradas = s.filtradas ?? verificadorHibp(log, env.HIBP_HABILITADO && env.NODE_ENV !== 'test')
  const tokens = emisorTokensJose(env.JWT_SECRET)
  const eventos = new PublicadorSocketIo()

  const inventario = crearCasosInventario({ uow, reloj, eventos, log })
  // pedidos y domicilios se conocen mutuamente a través de funciones (sin importarse entre sí).
  let domicilios: CasosDomicilios | null = null
  const pedidos = crearCasosPedidos({
    uow,
    reloj,
    cripto,
    eventos,
    push,
    log,
    inventario,
    permitirFueraDeHorario: env.PERMITIR_PEDIDOS_FUERA_DE_HORARIO,
    eta: (id) => domicilios?.eta(id) ?? null,
    alSalirDeRecorrido: (id) => domicilios?.pedidoCerrado(id),
  })
  domicilios = crearCasosDomicilios({ uow, reloj, mapas, eventos, log, pedidos: () => pedidos })
  const casos: Casos = {
    auth: crearCasosAuth({ uow, reloj, cripto, hasher, filtradas, tokens, correo, log, webOrigin: env.WEB_ORIGIN, proveedores }),
    menu: crearCasosMenu({ uow, reloj, eventos }),
    inventario,
    pedidos,
    push: crearCasosPush({ uow, push, tokens, pedidos }),
    domicilios,
  }

  return { env, conexion, uow, log, reloj, cripto, hasher, filtradas, tokens, correo, push, eventos, mapas, geocoder, proveedores, firmarCodigoSimulado, casos }
}

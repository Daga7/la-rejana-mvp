import type { Env } from './config/env'
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

  return {
    env,
    conexion,
    uow,
    log,
    reloj: s.reloj ?? { ahora: () => new Date() },
    cripto: criptografiaNode(env.TOKENS_PEPPER),
    hasher: s.hasher ?? hasherBcrypt(12),
    filtradas: s.filtradas ?? verificadorHibp(log, env.HIBP_HABILITADO && env.NODE_ENV !== 'test'),
    tokens: emisorTokensJose(env.JWT_SECRET),
    correo,
    push,
    eventos: new PublicadorSocketIo(),
    mapas,
    geocoder,
  }
}

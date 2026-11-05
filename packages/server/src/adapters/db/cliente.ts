import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export type BaseDatos = NodePgDatabase<typeof schema>
/** Transacción o conexión: los repositorios aceptan cualquiera de las dos. */
export type Ejecutor = BaseDatos | Parameters<Parameters<BaseDatos['transaction']>[0]>[0]

// numeric/bigint llegan como string desde pg; los convertimos donde hace falta en los repositorios.

export interface ConexionBD {
  db: BaseDatos
  pool: pg.Pool
  cerrar: () => Promise<void>
}

export interface OpcionesBD {
  /** Cifra la conexión con TLS (Supabase o cualquier base fuera de la red privada). */
  ssl?: boolean
  /** Certificado raíz (PEM) del proveedor: con él se verifican el certificado y el nombre del servidor. Sin él se cifra sin verificar. */
  ca?: string
  /** Conexiones simultáneas máximas del pool. */
  max?: number
  /** Errores de conexiones inactivas (p. ej. el pooler se reinicia). Sin este manejador, `pg` tumbaría el proceso. */
  alError?: (e: Error) => void
}

/** Límite por consulta: evita que una consulta lenta acapare una conexión. */
const LIMITE_CONSULTA_MS = 15_000

const PARAMETROS_SSL = ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'sslnegotiation', 'uselibpqcompat']
const MODOS_CON_TLS = new Set(['require', 'verify-ca', 'verify-full'])

/**
 * Resuelve la URL y el TLS de la conexión. Los parámetros ssl* de la URL se quitan porque `pg` los aplica
 * encima de la opción `ssl`: con `?sslmode=require` exigiría verificar el certificado de Supabase contra las
 * autoridades del sistema y la conexión fallaría. Si la URL pedía TLS, se mantiene el cifrado.
 */
export function prepararConexion(url: string, opciones: Pick<OpcionesBD, 'ssl' | 'ca'> = {}): { url: string; ssl: pg.PoolConfig['ssl'] } {
  let limpia = url
  let pideTls = false
  try {
    const u = new URL(url)
    pideTls = MODOS_CON_TLS.has(u.searchParams.get('sslmode') ?? '') || ['true', '1'].includes(u.searchParams.get('ssl') ?? '')
    if (PARAMETROS_SSL.some((p) => u.searchParams.has(p))) {
      for (const p of PARAMETROS_SSL) u.searchParams.delete(p)
      limpia = u.toString()
    }
  } catch {
    // URL no estándar: pg la interpreta tal cual.
  }
  const cifrar = opciones.ssl || pideTls
  return { url: limpia, ssl: cifrar ? (opciones.ca ? { ca: opciones.ca, rejectUnauthorized: true } : { rejectUnauthorized: false }) : undefined }
}

/** Certificado PEM pegado en una variable de entorno: acepta saltos de línea reales o escritos como \n. */
export function certificadoPem(valor: string | undefined): string | undefined {
  const v = valor?.trim()
  return v ? v.replace(/\\n/g, '\n') : undefined
}

/** Opciones de conexión desde el entorno, para los scripts sueltos (migraciones, seed, crear-admin). */
export function opcionesBDDelEntorno(entorno: NodeJS.ProcessEnv = process.env): Pick<OpcionesBD, 'ssl' | 'ca'> {
  return { ssl: ['true', '1'].includes(entorno.DATABASE_SSL ?? ''), ca: certificadoPem(entorno.DATABASE_SSL_CA) }
}

export function conectarBD(url: string, opciones: OpcionesBD = {}): ConexionBD {
  const destino = prepararConexion(url, opciones)
  const pool = new pg.Pool({
    connectionString: destino.url,
    ssl: destino.ssl,
    max: opciones.max ?? 10,
    // Evita conexiones colgadas si la red de la plataforma se cae.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: 'rejana-api',
    // El límite va con SET al abrir cada conexión (el pool espera a que termine antes de entregarla) y no como
    // parámetro de arranque: los poolers (Supavisor de Supabase, PgBouncer) ignoran o rechazan los que no conocen.
    onConnect: async (cliente) => {
      await cliente.query(`SET statement_timeout = ${LIMITE_CONSULTA_MS}`)
    },
  })
  pool.on('error', (e) => (opciones.alError ?? ((x: Error) => console.error('Error en una conexión inactiva de PostgreSQL:', x.message)))(e))
  const db = drizzle(pool, { schema, casing: undefined })
  return { db, pool, cerrar: () => pool.end() }
}

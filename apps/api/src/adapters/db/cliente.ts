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

export function conectarBD(url: string, opciones: { ssl?: boolean; max?: number } = {}): ConexionBD {
  const pool = new pg.Pool({
    connectionString: url,
    max: opciones.max ?? 10,
    ssl: opciones.ssl ? { rejectUnauthorized: false } : undefined,
    // Evita conexiones colgadas si la red de la plataforma se cae.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
    application_name: 'rejana-api',
  })
  const db = drizzle(pool, { schema, casing: undefined })
  return { db, pool, cerrar: () => pool.end() }
}

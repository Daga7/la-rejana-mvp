import { sql } from 'drizzle-orm'
import type { BaseDatos } from '../db/cliente'

/**
 * Límite de solicitudes por clave en ventana fija. En serverless no hay memoria compartida entre instancias,
 * así que el contador vive en PostgreSQL (una sola sentencia atómica por solicitud limitada).
 */
export interface Limitador {
  /** Devuelve true si la solicitud entra dentro del límite. */
  golpear(clave: string, max: number, ventanaSegundos: number): Promise<boolean>
}

const UNIDADES: Record<string, number> = { second: 1, seconds: 1, minute: 60, minutes: 60, hour: 3600, hours: 3600 }

export function segundosDeVentana(texto: string): number {
  const m = /^(\d+)\s*(second|seconds|minute|minutes|hour|hours)$/.exec(texto.trim())
  if (!m) throw new Error(`Ventana de límite inválida: ${texto}`)
  return Number(m[1]) * UNIDADES[m[2]!]!
}

export function limitadorPostgres(db: BaseDatos): Limitador {
  return {
    async golpear(clave, max, ventanaSegundos) {
      const r = await db.execute<{ conteo: number }>(sql`
        insert into limites_solicitudes (clave, inicio, conteo) values (${clave}, now(), 1)
        on conflict (clave) do update set
          inicio = case when limites_solicitudes.inicio < now() - make_interval(secs => ${ventanaSegundos}) then now() else limites_solicitudes.inicio end,
          conteo = case when limites_solicitudes.inicio < now() - make_interval(secs => ${ventanaSegundos}) then 1 else limites_solicitudes.conteo + 1 end
        returning conteo`)
      // Limpieza oportunista de contadores viejos (no bloquea la solicitud).
      if (Math.random() < 0.01) void db.execute(sql`delete from limites_solicitudes where inicio < now() - interval '1 day'`).catch(() => undefined)
      return Number(r.rows[0]?.conteo ?? 1) <= max
    },
  }
}

/** Límite global en memoria por instancia (mejor esfuerzo; los límites estrictos van en PostgreSQL). */
export function limitadorMemoria() {
  const ventanas = new Map<string, { inicio: number; conteo: number }>()
  return (clave: string, max: number, ventanaMs: number) => {
    const ahora = Date.now()
    if (ventanas.size > 5000) for (const [k, v] of ventanas) if (ahora - v.inicio > ventanaMs) ventanas.delete(k)
    const v = ventanas.get(clave)
    if (!v || ahora - v.inicio > ventanaMs) {
      ventanas.set(clave, { inicio: ahora, conteo: 1 })
      return true
    }
    v.conteo++
    return v.conteo <= max
  }
}

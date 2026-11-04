import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Contenedor } from '../../../contenedor'

export function rutasSalud(app: FastifyInstance, c: Contenedor) {
  app.get('/api/salud', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_req, reply) => {
    try {
      await c.conexion.db.execute(sql`select 1`)
      return { estado: 'ok', bd: 'ok', hora: c.reloj.ahora().toISOString() }
    } catch {
      return reply.status(503).send({ estado: 'degradado', bd: 'sin conexión' })
    }
  })
}

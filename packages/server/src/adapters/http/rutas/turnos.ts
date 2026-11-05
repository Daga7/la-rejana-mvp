import { cerrarTurnoSchema, filtroTurnosSchema, id } from '@rejana/shared'
import type { Peticion, Router } from '../router'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import { actorDe } from '../servidor'

/** Turnos: el personal marca entrada y salida; el admin consulta y cierra turnos olvidados. */
export function rutasTurnos(app: Router, c: Contenedor) {
  const { turnos } = c.casos
  const actor = (req: Peticion) => actorDe(req, c, c.env)
  const ctx = (req: Peticion) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })
  const limite = (max: number, ventana: string) => ({ rateLimit: { max, timeWindow: ventana } })

  app.get('/api/turnos/actual', async (req) => ({ turno: await turnos.actual(await actor(req)) }))
  app.post('/api/turnos/entrada', { config: limite(20, '1 minute') }, async (req, reply) => reply.status(201).send({ turno: await turnos.entrada(await actor(req), ctx(req)) }))
  app.post('/api/turnos/salida', { config: limite(20, '1 minute') }, async (req) => ({ turno: await turnos.salida(await actor(req), ctx(req)) }))

  app.get('/api/admin/turnos', async (req) => ({ reporte: await turnos.reporte(await actor(req), filtroTurnosSchema.parse(req.query)) }))
  app.post('/api/admin/turnos/:id/cerrar', { config: limite(30, '1 minute') }, async (req) => {
    const datos = cerrarTurnoSchema.parse(req.body)
    return { turno: await turnos.cerrarPorAdmin(await actor(req), z.object({ id }).parse(req.params).id, datos, ctx(req)) }
  })
}

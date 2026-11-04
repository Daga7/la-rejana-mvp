import { buzonSchema, ESTADOS_BUZON, estadoBuzonSchema, id } from '@rejana/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import { actorDe } from '../servidor'

export function rutasBuzon(app: FastifyInstance, c: Contenedor) {
  const { buzon } = c.casos
  const actor = (req: FastifyRequest) => actorDe(req, c, c.env)

  // logLevel 'warn': este endpoint no deja ni siquiera la línea de acceso en los logs.
  app.post('/api/buzon', { logLevel: 'warn', config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const datos = buzonSchema.parse(req.body)
    await buzon.enviar(await actor(req), datos)
    return reply.status(202).send({ mensaje: 'Recibimos tu mensaje. ¡Gracias por ayudarnos a mejorar!' })
  })

  app.get('/api/admin/buzon', async (req, reply) => {
    const { estado } = z.object({ estado: z.enum(ESTADOS_BUZON).optional() }).parse(req.query)
    reply.header('Cache-Control', 'no-store')
    return { mensajes: await buzon.listar(await actor(req), estado) }
  })

  app.patch('/api/admin/buzon/:id', async (req, reply) => {
    const { estado } = estadoBuzonSchema.parse(req.body)
    await buzon.cambiarEstado(await actor(req), z.object({ id }).parse(req.params).id, estado, { ip: req.ipCliente, userAgent: null })
    return reply.status(204).send()
  })
}

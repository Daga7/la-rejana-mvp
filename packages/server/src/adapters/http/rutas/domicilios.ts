import { id, iniciarRecorridoSchema, planRutaSchema, ubicacionSchema } from '@rejana/shared'
import type { Peticion, Router } from '../router'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import { actorDe } from '../servidor'

export function rutasDomicilios(app: Router, c: Contenedor) {
  const { domicilios } = c.casos
  const actor = (req: Peticion) => actorDe(req, c, c.env)
  const ctx = (req: Peticion) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })

  app.get('/api/domiciliario/pedidos', async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    return domicilios.misPedidos(await actor(req))
  })
  app.post('/api/domiciliario/ruta', async (req) => domicilios.planificar(await actor(req), planRutaSchema.parse(req.body).pedidoIds))
  app.post('/api/domiciliario/recorridos', async (req, reply) => reply.status(201).send({ recorrido: await domicilios.iniciarRecorrido(await actor(req), iniciarRecorridoSchema.parse(req.body).pedidoIds, ctx(req)) }))
  app.post('/api/domiciliario/recorridos/finalizar', async (req) => domicilios.finalizarRecorrido(await actor(req)))
  app.post('/api/domiciliario/ubicacion', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => domicilios.actualizarUbicacion(await actor(req), ubicacionSchema.parse(req.body)))
  app.post('/api/pedidos/:id/entregar', async (req) => ({ pedido: await domicilios.entregar(await actor(req), z.object({ id }).parse(req.params).id, ctx(req)) }))
}

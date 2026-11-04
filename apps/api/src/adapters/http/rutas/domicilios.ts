import { id, iniciarRecorridoSchema, planRutaSchema, ubicacionSchema } from '@rejana/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Socket } from 'socket.io'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import type { ClaimsTicket } from '../../../ports/servicios'
import { actorDe } from '../servidor'

export function rutasDomicilios(app: FastifyInstance, c: Contenedor) {
  const { domicilios } = c.casos
  const actor = (req: FastifyRequest) => actorDe(req, c, c.env)
  const ctx = (req: FastifyRequest) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })

  app.get('/api/domiciliario/pedidos', async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    return domicilios.misPedidos(await actor(req))
  })
  app.post('/api/domiciliario/ruta', async (req) => domicilios.planificar(await actor(req), planRutaSchema.parse(req.body).pedidoIds))
  app.post('/api/domiciliario/recorridos', async (req, reply) => reply.status(201).send({ recorrido: await domicilios.iniciarRecorrido(await actor(req), iniciarRecorridoSchema.parse(req.body).pedidoIds, ctx(req)) }))
  app.post('/api/domiciliario/recorridos/finalizar', async (req) => domicilios.finalizarRecorrido(await actor(req)))
  // Respaldo REST cuando el WebSocket no está disponible.
  app.post('/api/domiciliario/ubicacion', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => domicilios.actualizarUbicacion(await actor(req), ubicacionSchema.parse(req.body)))
  app.post('/api/pedidos/:id/entregar', async (req) => ({ pedido: await domicilios.entregar(await actor(req), z.object({ id }).parse(req.params).id, ctx(req)) }))
}

/** Ubicación por WebSocket: solo sockets de domiciliarios (según su ticket). */
export function manejadorUbicacion(c: Contenedor) {
  return (socket: Socket, claims: ClaimsTicket) => {
    if (claims.rol !== 'domiciliario') return
    socket.on('ubicacion', async (datos: unknown, ack?: (r: unknown) => void) => {
      const r = ubicacionSchema.safeParse(datos)
      if (!r.success) return ack?.({ ok: false, error: 'Ubicación inválida' })
      try {
        // Se revalida la sesión del domiciliario contra la BD en cada actualización.
        const u = await c.uow.repos.usuarios.porId(claims.sub)
        if (!u || !u.activo || u.rol !== 'domiciliario') {
          socket.disconnect(true)
          return
        }
        const res = await c.casos.domicilios.actualizarUbicacion({ tipo: 'usuario', id: u.id, rol: u.rol, sedeId: u.sedeId, sesionId: 'socket' }, r.data)
        ack?.({ ok: true, ...res })
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message })
      }
    })
  }
}

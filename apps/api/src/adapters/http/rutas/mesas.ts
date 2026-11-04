import { abrirCuentaSchema, actualizarCuentaSchema, cobrarCuentaSchema, id, mesaSchema, rondaSchema } from '@rejana/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import { actorDe } from '../servidor'

/** Servicio a la mesa: salón y cuentas (mesero), cobro (caja) y mesas de cada sede (admin). */
export function rutasMesas(app: FastifyInstance, c: Contenedor) {
  const { mesas, pedidos } = c.casos
  const actor = (req: FastifyRequest) => actorDe(req, c, c.env)
  const ctx = (req: FastifyRequest) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })
  const conId = z.object({ id })
  const conSede = z.object({ sedeId: id })
  const limite = (max: number, ventana: string) => ({ rateLimit: { max, timeWindow: ventana } })

  app.get('/api/mesas/:sedeId/salon', async (req) => ({ salon: await mesas.salon(await actor(req), conSede.parse(req.params).sedeId) }))

  app.post('/api/mesas/:sedeId/cuentas', { config: limite(60, '1 minute') }, async (req, reply) => {
    const datos = abrirCuentaSchema.parse(req.body)
    const cuenta = await mesas.abrir(await actor(req), conSede.parse(req.params).sedeId, datos, ctx(req))
    return reply.status(201).send({ cuenta })
  })

  app.get('/api/cuentas/:id', async (req) => ({ cuenta: await mesas.detalle(await actor(req), conId.parse(req.params).id) }))

  app.patch('/api/cuentas/:id', { config: limite(60, '1 minute') }, async (req) => {
    const datos = actualizarCuentaSchema.parse(req.body)
    return { cuenta: await mesas.actualizar(await actor(req), conId.parse(req.params).id, datos, ctx(req)) }
  })

  // Ronda para la cocina. Con Idempotency-Key: si el celular reintenta por mala señal, no se duplica.
  app.post('/api/cuentas/:id/rondas', { config: limite(60, '1 minute') }, async (req, reply) => {
    const datos = rondaSchema.parse(req.body)
    const clave = req.headers['idempotency-key']
    const claveIdempotencia = typeof clave === 'string' ? z.uuid().parse(clave) : null
    const pedido = await pedidos.crearRonda(await actor(req), conId.parse(req.params).id, datos, { claveIdempotencia }, ctx(req))
    return reply.status(201).send({ pedido })
  })

  app.post('/api/cuentas/:id/liberar', { config: limite(30, '1 minute') }, async (req) => ({
    cuenta: await mesas.liberar(await actor(req), conId.parse(req.params).id, ctx(req)),
  }))

  app.post('/api/cuentas/:id/cobrar', { config: limite(30, '1 minute') }, async (req) => {
    const datos = cobrarCuentaSchema.parse(req.body)
    return { cuenta: await mesas.cobrar(await actor(req), conId.parse(req.params).id, datos, ctx(req)) }
  })

  // --- Administración ------------------------------------------------------------------------------
  app.get('/api/admin/sedes/:sedeId/mesas', async (req) => ({ mesas: await mesas.listarMesas(await actor(req), conSede.parse(req.params).sedeId) }))

  app.post('/api/admin/sedes/:sedeId/mesas', { config: limite(60, '1 minute') }, async (req, reply) => {
    const datos = mesaSchema.parse(req.body)
    const mesa = await mesas.crearMesa(await actor(req), conSede.parse(req.params).sedeId, datos, ctx(req))
    return reply.status(201).send({ mesa })
  })

  app.put('/api/admin/mesas/:id', { config: limite(60, '1 minute') }, async (req) => {
    const datos = mesaSchema.parse(req.body)
    return { mesa: await mesas.actualizarMesa(await actor(req), conId.parse(req.params).id, datos, ctx(req)) }
  })
}

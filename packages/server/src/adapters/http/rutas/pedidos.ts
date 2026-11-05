import {
  asignarDomiciliarioSchema,
  cambiarEstadoSchema,
  cancelarPedidoSchema,
  crearPedidoSchema,
  direccionClienteSchema,
  ESTADOS_PEDIDO,
  id,
  latitud,
  longitud,
  registrarPagoSchema,
  suscripcionPushSchema,
} from '@rejana/shared'
import type { Peticion, Router } from '../router'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import { err } from '../../../domain/errores'
import { actorDe } from '../servidor'

export function rutasPedidos(app: Router, c: Contenedor) {
  const { pedidos, push } = c.casos
  const actor = (req: Peticion) => actorDe(req, c, c.env)
  const ctx = (req: Peticion) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })
  const tokenPedido = (req: Peticion) => {
    const t = req.headers['x-pedido-token']
    return typeof t === 'string' && t.length < 200 ? t : null
  }
  const conId = z.object({ id })
  const limite = (max: number, ventana: string) => ({ rateLimit: { max, timeWindow: ventana } })

  // --- Cliente / invitado ------------------------------------------------------------------------
  app.post('/api/pedidos', { config: limite(10, '1 minute') }, async (req, reply) => {
    const datos = crearPedidoSchema.parse(req.body)
    const clave = req.headers['idempotency-key']
    const claveIdempotencia = typeof clave === 'string' ? z.uuid().parse(clave) : null
    const r = await pedidos.crear(await actor(req), datos, { claveIdempotencia }, ctx(req))
    return reply.status(201).send(r)
  })

  app.get('/api/pedidos/:id', async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    return { pedido: await pedidos.obtener(await actor(req), conId.parse(req.params).id, tokenPedido(req)) }
  })

  app.post('/api/pedidos/:id/cancelar', { config: limite(10, '1 minute') }, async (req) => {
    const datos = cancelarPedidoSchema.parse(req.body)
    return { pedido: await pedidos.cancelar(await actor(req), conId.parse(req.params).id, datos, tokenPedido(req), ctx(req)) }
  })

  app.get('/api/mis-pedidos', async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    return { pedidos: await pedidos.misPedidos(await actor(req)) }
  })

  app.post('/api/pedidos/invitado', { config: limite(30, '1 minute') }, async (req) => {
    const { credenciales } = z.object({ credenciales: z.array(z.object({ id, token: z.string().min(20).max(200) })).max(20) }).parse(req.body)
    return { pedidos: await pedidos.deInvitado(credenciales) }
  })

  // --- Direcciones del cliente --------------------------------------------------------------------
  app.get('/api/cuenta/direcciones', async (req) => {
    const a = await actor(req)
    if (a.tipo !== 'usuario') throw err.noAutenticado()
    return { direcciones: await c.uow.repos.direcciones.deUsuario(a.id) }
  })
  app.post('/api/cuenta/direcciones', async (req, reply) => {
    const a = await actor(req)
    if (a.tipo !== 'usuario') throw err.noAutenticado()
    const d = direccionClienteSchema.parse(req.body)
    if ((await c.uow.repos.direcciones.contar(a.id)) >= 10) throw err.validacion('Puedes guardar máximo 10 direcciones')
    const creada = await c.uow.repos.direcciones.crear({ usuarioId: a.id, etiqueta: d.etiqueta, direccion: d.direccion, detalle: d.detalle ?? null, barrio: d.barrio ?? null, lat: d.lat, lng: d.lng })
    return reply.status(201).send({ direccion: creada })
  })
  app.delete('/api/cuenta/direcciones/:id', async (req, reply) => {
    const a = await actor(req)
    if (a.tipo !== 'usuario') throw err.noAutenticado()
    if (!(await c.uow.repos.direcciones.eliminar(conId.parse(req.params).id, a.id))) throw err.noEncontrado()
    return reply.status(204).send()
  })

  // --- Operación (cocina, caja, admin) -------------------------------------------------------------
  app.get('/api/operacion/pedidos', async (req, reply) => {
    const q = z
      .object({
        sedeId: id,
        estados: z
          .string()
          .optional()
          .transform((v) => (v ? v.split(',') : undefined))
          .pipe(z.array(z.enum(ESTADOS_PEDIDO)).optional()),
        cerrados: z.enum(['1', '0']).optional(),
      })
      .parse(req.query)
    reply.header('Cache-Control', 'no-store')
    return { pedidos: await pedidos.operacion(await actor(req), q.sedeId, { estados: q.estados, incluirCerrados: q.cerrados === '1' }) }
  })

  app.get('/api/operacion/domiciliarios', async (req) => {
    const { sedeId } = z.object({ sedeId: id }).parse(req.query)
    return { domiciliarios: await pedidos.domiciliarios(await actor(req), sedeId) }
  })

  app.patch('/api/pedidos/:id/estado', async (req) => {
    const datos = cambiarEstadoSchema.parse(req.body)
    return { pedido: await pedidos.cambiarEstado(await actor(req), conId.parse(req.params).id, datos, ctx(req)) }
  })

  app.post('/api/pedidos/:id/asignar', async (req) => {
    const { domiciliarioId } = asignarDomiciliarioSchema.parse(req.body)
    return { pedido: await pedidos.asignarDomiciliario(await actor(req), conId.parse(req.params).id, domiciliarioId, ctx(req)) }
  })

  app.get('/api/pedidos/:id/pagos', async (req) => ({ pagos: await pedidos.pagos(await actor(req), conId.parse(req.params).id) }))

  app.post('/api/pedidos/:id/pagos', async (req) => {
    const datos = registrarPagoSchema.parse(req.body)
    return { pedido: await pedidos.registrarPago(await actor(req), conId.parse(req.params).id, datos, ctx(req)) }
  })

  app.post('/api/pedidos/:id/cerrar', async (req) => ({ pedido: await pedidos.cerrar(await actor(req), conId.parse(req.params).id, ctx(req)) }))

  // --- Notificaciones push y tiempo real ------------------------------------------------------------
  app.get('/api/push/clave-publica', async () => ({ clave: push.clavePublica() }))

  app.post('/api/push/suscripciones', { config: limite(20, '1 minute') }, async (req, reply) => {
    const datos = suscripcionPushSchema.parse(req.body)
    await push.suscribir(await actor(req), datos, tokenPedido(req))
    return reply.status(204).send()
  })

  app.delete('/api/push/suscripciones', async (req, reply) => {
    const { endpoint } = z.object({ endpoint: z.string().max(2000) }).parse(req.body)
    await push.desuscribir(endpoint)
    return reply.status(204).send()
  })

  // --- Direcciones en el mapa ---------------------------------------------------------------------------
  app.get('/api/geo/buscar', { config: limite(20, '1 minute') }, async (req) => {
    const q = z.object({ q: z.string().trim().min(3).max(120), lat: z.coerce.number().pipe(latitud), lng: z.coerce.number().pipe(longitud) }).parse(req.query)
    return { resultados: await c.geocoder.buscar(q.q, { lat: q.lat, lng: q.lng }) }
  })

  app.get('/api/geo/inverso', { config: limite(20, '1 minute') }, async (req) => {
    const q = z.object({ lat: z.coerce.number().pipe(latitud), lng: z.coerce.number().pipe(longitud) }).parse(req.query)
    return { direccion: await c.geocoder.inverso(q) }
  })
}

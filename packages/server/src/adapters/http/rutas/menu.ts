import { categoriaSchema, id, insumoSchema, menuSedeSchema, movimientoInventarioSchema, productoSchema, recetaSchema, sedeSchema, stockMinimoSchema } from '@rejana/shared'
import type { Peticion, Router } from '../router'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import { actorDe } from '../servidor'

export function rutasMenu(app: Router, c: Contenedor) {
  const { menu, inventario } = c.casos
  const actor = (req: Peticion) => actorDe(req, c, c.env)
  const ctx = (req: Peticion) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })
  const conId = z.object({ id })

  // --- Público -------------------------------------------------------------------------------
  app.get('/api/sedes', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=30')
    return { sedes: await menu.sedes() }
  })

  app.get('/api/sedes/:id/menu', async (req, reply) => {
    const { id: sedeId } = conId.parse(req.params)
    // El menú cambia con el inventario: sin caché compartida (el service worker guarda una copia para usar sin conexión).
    reply.header('Cache-Control', 'no-cache')
    return menu.menu(sedeId)
  })

  // --- Catálogo (admin) ------------------------------------------------------------------------
  app.get('/api/admin/catalogo', async (req) => menu.catalogo(await actor(req)))

  app.post('/api/admin/categorias', async (req, reply) => reply.status(201).send({ categoria: await menu.crearCategoria(await actor(req), categoriaSchema.parse(req.body), ctx(req)) }))
  app.put('/api/admin/categorias/:id', async (req) => ({ categoria: await menu.actualizarCategoria(await actor(req), conId.parse(req.params).id, categoriaSchema.parse(req.body), ctx(req)) }))

  app.post('/api/admin/productos', async (req, reply) => {
    const datos = productoSchema.parse(req.body)
    return reply.status(201).send({ producto: await menu.crearProducto(await actor(req), { ...datos, imagenUrl: datos.imagenUrl ?? null }, ctx(req)) })
  })
  app.put('/api/admin/productos/:id', async (req) => {
    const datos = productoSchema.parse(req.body)
    return { producto: await menu.actualizarProducto(await actor(req), conId.parse(req.params).id, { ...datos, imagenUrl: datos.imagenUrl ?? null }, ctx(req)) }
  })
  app.put('/api/admin/productos/:id/receta', async (req) => ({ receta: await menu.guardarReceta(await actor(req), conId.parse(req.params).id, recetaSchema.parse(req.body).items, ctx(req)) }))

  const sedeProducto = z.object({ sedeId: id, productoId: id })
  app.put('/api/admin/menu/:sedeId/:productoId', async (req, reply) => {
    const p = sedeProducto.parse(req.params)
    await menu.guardarEnMenu(await actor(req), p.sedeId, p.productoId, menuSedeSchema.parse(req.body), ctx(req))
    return reply.status(204).send()
  })
  app.delete('/api/admin/menu/:sedeId/:productoId', async (req, reply) => {
    const p = sedeProducto.parse(req.params)
    await menu.quitarDeMenu(await actor(req), p.sedeId, p.productoId, ctx(req))
    return reply.status(204).send()
  })

  // --- Sedes (admin) ---------------------------------------------------------------------------
  const datosSede = (body: unknown) => {
    const s = sedeSchema.parse(body)
    return { ...s, qrPagoUrl: s.qrPagoUrl ?? null, qrPagoInstrucciones: s.qrPagoInstrucciones ?? null }
  }
  app.get('/api/admin/sedes', async (req) => ({ sedes: await menu.sedesAdmin(await actor(req)) }))
  app.post('/api/admin/sedes', async (req, reply) => reply.status(201).send({ sede: await menu.crearSede(await actor(req), datosSede(req.body), ctx(req)) }))
  app.put('/api/admin/sedes/:id', async (req) => ({ sede: await menu.actualizarSede(await actor(req), conId.parse(req.params).id, datosSede(req.body), ctx(req)) }))

  // --- Inventario ------------------------------------------------------------------------------
  app.get('/api/inventario/:id', async (req) => inventario.deSede(await actor(req), conId.parse(req.params).id))
  app.get('/api/inventario/:id/movimientos', async (req) => {
    const { insumoId } = z.object({ insumoId: id.optional() }).parse(req.query)
    return { movimientos: await inventario.movimientos(await actor(req), conId.parse(req.params).id, insumoId) }
  })
  app.post('/api/admin/inventario/movimientos', async (req) => {
    const datos = movimientoInventarioSchema.parse(req.body)
    return inventario.registrarMovimiento(await actor(req), { ...datos, nota: datos.nota }, ctx(req))
  })
  app.put('/api/admin/inventario/minimo', async (req, reply) => {
    await inventario.fijarMinimo(await actor(req), stockMinimoSchema.parse(req.body), ctx(req))
    return reply.status(204).send()
  })

  app.get('/api/admin/insumos', async (req) => ({ insumos: await inventario.insumos(await actor(req)) }))
  app.post('/api/admin/insumos', async (req, reply) => reply.status(201).send({ insumo: await inventario.crearInsumo(await actor(req), insumoSchema.parse(req.body), ctx(req)) }))
  app.put('/api/admin/insumos/:id', async (req) => ({ insumo: await inventario.actualizarInsumo(await actor(req), conId.parse(req.params).id, insumoSchema.parse(req.body), ctx(req)) }))
}

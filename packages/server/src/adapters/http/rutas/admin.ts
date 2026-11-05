import { actualizarEmpleadoSchema, consultaReporteSchema, id } from '@rejana/shared'
import type { Peticion, Router } from '../router'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import { actorDe } from '../servidor'

export function rutasAdmin(app: Router, c: Contenedor) {
  const { admin, reportes } = c.casos
  const actor = (req: Peticion) => actorDe(req, c, c.env)
  const ctx = (req: Peticion) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })

  app.get('/api/admin/tablero', async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    return reportes.tablero(await actor(req))
  })

  app.get('/api/admin/reportes/:tipo', async (req) => {
    const { tipo } = z.object({ tipo: z.enum(['ventas', 'productos', 'inventario']) }).parse(req.params)
    const q = consultaReporteSchema.extend({ insumo: z.string().trim().max(60).optional() }).parse(req.query)
    return reportes.consultar(await actor(req), tipo, {
      sedeId: q.sedeId === 'todas' ? null : q.sedeId,
      periodo: q.periodo,
      desde: q.desde,
      hasta: q.hasta,
      insumo: q.insumo,
    })
  })

  app.get('/api/admin/empleados', async (req) => ({ empleados: await admin.empleados(await actor(req)) }))

  app.patch('/api/admin/empleados/:id', async (req) => {
    const datos = actualizarEmpleadoSchema.parse(req.body)
    return { empleado: await admin.actualizarEmpleado(await actor(req), z.object({ id }).parse(req.params).id, datos, ctx(req)) }
  })

  app.get('/api/admin/auditoria', async (req) => {
    const q = z.object({ entidad: z.string().max(40).optional(), antesDe: z.iso.datetime().optional() }).parse(req.query)
    return { registros: await admin.auditoria(await actor(req), { entidad: q.entidad, antesDe: q.antesDe ? new Date(q.antesDe) : undefined }) }
  })
}

import type { InventarioItemDTO, MovimientoInventarioDTO, Unidad } from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { r3, stockBajo } from '../domain/inventario'
import { exigirPermiso, exigirSede, type Actor } from '../domain/permisos'
import type { UnidadDeTrabajo } from '../ports/repositorios'
import type { Logger, PublicadorEventos, Reloj } from '../ports/servicios'
import { auditar, type ContextoSolicitud } from './comun'
import { productosDeSede } from './menu'

export interface DepsInventario {
  uow: UnidadDeTrabajo
  reloj: Reloj
  eventos: PublicadorEventos
  log: Logger
}

export function crearCasosInventario(d: DepsInventario) {
  const { uow } = d

  /** Avisa por tiempo real (cocina/caja/admin de la sede) si algún insumo quedó en o bajo su mínimo. */
  async function revisarAlertas(sedeId: string, insumoIds: string[]) {
    if (insumoIds.length === 0) return
    const items = await uow.repos.inventario.deSede(sedeId)
    for (const i of items) {
      if (insumoIds.includes(i.insumoId) && stockBajo(i.cantidad, i.stockMinimo)) {
        d.eventos.inventarioBajo(sedeId, { insumoId: i.insumoId, insumoNombre: i.insumoNombre, cantidad: i.cantidad, stockMinimo: i.stockMinimo })
      }
    }
  }

  return {
    revisarAlertas,

    /** Stock por insumo de una sede + cuántas unidades de cada producto alcanzan. */
    async deSede(actor: Actor, sedeId: string) {
      exigirPermiso(actor, 'inventario.ver')
      exigirSede(actor, sedeId)
      if (!(await uow.repos.sedes.porId(sedeId))) throw err.noEncontrado('La sede no existe')
      const [items, productos] = await Promise.all([uow.repos.inventario.deSede(sedeId), productosDeSede(uow.repos, sedeId)])
      const inventario: InventarioItemDTO[] = items.map((i) => ({ ...i, bajo: stockBajo(i.cantidad, i.stockMinimo) }))
      return {
        inventario,
        capacidad: productos.map((p) => ({ productoId: p.id, nombre: p.nombre, maxUnidades: p.maxUnidades, disponible: p.disponible, agotado: p.agotado })),
        alertas: inventario.filter((i) => i.bajo).length,
      }
    },

    /** Entrada de mercancía (sumar) o conteo físico (fijar el saldo). Queda en movimientos y auditoría. */
    async registrarMovimiento(
      actor: Actor,
      e: { sedeId: string; insumoId: string; modo: 'sumar' | 'fijar'; cantidad: number; nota?: string },
      ctx: ContextoSolicitud,
    ) {
      const a = exigirPermiso(actor, 'inventario.gestionar')
      const insumo = await uow.repos.inventario.insumoPorId(e.insumoId)
      if (!insumo) throw err.noEncontrado('El insumo no existe')
      if (!(await uow.repos.sedes.porId(e.sedeId))) throw err.noEncontrado('La sede no existe')
      if (insumo.unidad === 'und' && !Number.isInteger(e.cantidad * 2)) throw err.validacion('Las unidades admiten enteros o medias unidades')
      const resultado = await uow.transaccion(async (repos) => {
        await repos.inventario.asegurarFila(e.sedeId, e.insumoId)
        const actual = (await repos.inventario.bloquear(e.sedeId, [e.insumoId])).get(e.insumoId) ?? 0
        const delta = e.modo === 'sumar' ? e.cantidad : r3(e.cantidad - actual)
        if (e.modo === 'sumar' && e.cantidad <= 0) throw err.validacion('La entrada debe ser mayor que cero')
        if (delta === 0) return { saldo: actual, delta: 0 }
        const saldo = await repos.inventario.mover({
          sedeId: e.sedeId,
          insumoId: e.insumoId,
          delta,
          tipo: e.modo === 'sumar' ? 'entrada' : 'ajuste_manual',
          usuarioId: a.id,
          nota: e.nota ?? null,
        })
        await auditar(repos, actor, e.modo === 'sumar' ? 'inventario.entrada' : 'inventario.ajuste', 'inventario', `${e.sedeId}:${e.insumoId}`, { insumo: insumo.nombre, antes: actual, despues: saldo, delta, nota: e.nota ?? null }, ctx.ip)
        return { saldo, delta }
      })
      await revisarAlertas(e.sedeId, [e.insumoId])
      d.eventos.menuCambio(e.sedeId)
      return resultado
    },

    async fijarMinimo(actor: Actor, e: { sedeId: string; insumoId: string; stockMinimo: number }, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'inventario.gestionar')
      if (!(await uow.repos.inventario.insumoPorId(e.insumoId))) throw err.noEncontrado('El insumo no existe')
      await uow.repos.inventario.fijarMinimo(e.sedeId, e.insumoId, e.stockMinimo)
      await auditar(uow.repos, actor, 'inventario.minimo', 'inventario', `${e.sedeId}:${e.insumoId}`, { stockMinimo: e.stockMinimo }, ctx.ip)
      await revisarAlertas(e.sedeId, [e.insumoId])
    },

    async movimientos(actor: Actor, sedeId: string, insumoId?: string): Promise<MovimientoInventarioDTO[]> {
      exigirPermiso(actor, 'inventario.ver')
      exigirSede(actor, sedeId)
      const filas = await uow.repos.inventario.movimientos({ sedeId, insumoId, limite: 200 })
      return filas.map((m) => ({ ...m, creadoEn: m.creadoEn.toISOString() }))
    },

    // --- Insumos ------------------------------------------------------------------------------------

    async insumos(actor: Actor) {
      exigirPermiso(actor, 'inventario.ver')
      return uow.repos.inventario.insumos(false)
    },

    async crearInsumo(actor: Actor, datos: { nombre: string; unidad: Unidad; activo: boolean }, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'inventario.gestionar')
      if (await uow.repos.inventario.nombreInsumoExiste(datos.nombre)) throw err.conflicto('Ya existe un insumo con ese nombre')
      const insumo = await uow.repos.inventario.crearInsumo(datos)
      for (const s of await uow.repos.sedes.todas(false)) await uow.repos.inventario.asegurarFila(s.id, insumo.id)
      await auditar(uow.repos, actor, 'insumo.crear', 'insumo', insumo.id, datos, ctx.ip)
      return insumo
    },

    async actualizarInsumo(actor: Actor, id: string, datos: { nombre: string; unidad: Unidad; activo: boolean }, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'inventario.gestionar')
      const antes = await uow.repos.inventario.insumoPorId(id)
      if (!antes) throw err.noEncontrado('El insumo no existe')
      if (await uow.repos.inventario.nombreInsumoExiste(datos.nombre, id)) throw err.conflicto('Ya existe un insumo con ese nombre')
      if (antes.unidad !== datos.unidad) {
        // Cambiar la unidad dañaría recetas y saldos existentes.
        const sedes = await uow.repos.sedes.todas(false)
        for (const s of sedes) {
          const saldo = (await uow.repos.inventario.stock(s.id, [id])).get(id) ?? 0
          if (saldo !== 0) throw new ErrorDominio('CONFLICTO', 'No se puede cambiar la unidad de un insumo con existencias. Ajusta el saldo a cero primero.')
        }
      }
      const insumo = await uow.repos.inventario.actualizarInsumo(id, datos)
      await auditar(uow.repos, actor, 'insumo.actualizar', 'insumo', id, { antes, despues: datos }, ctx.ip)
      return insumo
    },
  }
}

export type CasosInventario = ReturnType<typeof crearCasosInventario>

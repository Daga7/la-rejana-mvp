import type { CobrarCuentaInput, CuentaMesaDTO, MesaDTO, MesaInput, MesaSalonDTO, PedidoMesaDTO, ResumenCuentaDTO, SalonDTO } from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { esMesa, estadoDeMesa, rondasSinServir, subtotalCuenta, validarCobroMesa } from '../domain/pedido'
import { exigirPermiso, exigirSede, type Actor } from '../domain/permisos'
import type { CuentaRegistro, MesaRegistro, PedidoMesaRegistro, Repositorios, UnidadDeTrabajo } from '../ports/repositorios'
import type { Logger, PublicadorEventos, Reloj } from '../ports/servicios'
import { auditar, type ContextoSolicitud } from './comun'
import { aPedidoDTO } from './pedidos'

export interface DepsMesas {
  uow: UnidadDeTrabajo
  reloj: Reloj
  eventos: PublicadorEventos
  log: Logger
}

const aMesaDTO = (m: MesaRegistro): MesaDTO => ({ id: m.id, sedeId: m.sedeId, numero: m.numero, zona: m.zona, puestos: m.puestos, activa: m.activa })

/** Violación de unicidad de PostgreSQL (p. ej., dos meseros abren la misma mesa a la vez). */
function esUnicidad(error: unknown): boolean {
  const codigo = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code
  return codigo === '23505'
}

/**
 * Servicio a la mesa. La cuenta agrupa las rondas (pedidos de canal "mesa") que el mesero envía a la
 * cocina; la caja la cobra de una vez, con pagos divididos y propina voluntaria.
 */
export function crearCasosMesas(d: DepsMesas) {
  const { uow, reloj } = d

  async function rondasDe(repos: Repositorios, cuentaIds: string[]): Promise<Map<string, PedidoMesaRegistro[]>> {
    const mapa = new Map<string, PedidoMesaRegistro[]>()
    if (cuentaIds.length === 0) return mapa
    const lista = (await repos.pedidos.listar({ canal: 'mesa', cuentaIds, limite: 1000 })).filter(esMesa)
    for (const r of lista) mapa.set(r.cuentaId, [...(mapa.get(r.cuentaId) ?? []), r])
    for (const rs of mapa.values()) rs.sort((a, b) => a.ronda - b.ronda)
    return mapa
  }

  async function rondasDTO(repos: Repositorios, rondas: PedidoMesaRegistro[]): Promise<PedidoMesaDTO[]> {
    const items = await repos.pedidos.items(rondas.map((r) => r.id))
    return rondas.map((r) => aPedidoDTO(r, items.get(r.id) ?? [], []) as PedidoMesaDTO)
  }

  function resumen(c: CuentaRegistro, rondas: PedidoMesaRegistro[]): ResumenCuentaDTO {
    return {
      id: c.id,
      meseroId: c.meseroId,
      meseroNombre: c.meseroNombre,
      comensales: c.comensales,
      subtotal: subtotalCuenta(rondas),
      abiertaEn: c.abiertaEn.toISOString(),
      cuentaPedidaEn: c.cuentaPedidaEn?.toISOString() ?? null,
      enCocina: rondas.filter((r) => r.estado === 'recibido' || r.estado === 'en_preparacion').length,
      paraServir: rondas.filter((r) => r.estado === 'listo').length,
      rondas: rondas.filter((r) => r.estado !== 'cancelado').length,
    }
  }

  async function cuentaDTO(repos: Repositorios, c: CuentaRegistro): Promise<CuentaMesaDTO> {
    const [rondas, pagos] = await Promise.all([rondasDe(repos, [c.id]), repos.mesas.pagos(c.id)])
    const lista = rondas.get(c.id) ?? []
    return {
      id: c.id,
      sedeId: c.sedeId,
      mesaId: c.mesaId,
      mesaNumero: c.mesaNumero,
      zona: c.zona,
      meseroId: c.meseroId,
      meseroNombre: c.meseroNombre,
      comensales: c.comensales,
      estado: c.estado,
      cuentaPedidaEn: c.cuentaPedidaEn?.toISOString() ?? null,
      abiertaEn: c.abiertaEn.toISOString(),
      cerradaEn: c.cerradaEn?.toISOString() ?? null,
      subtotal: subtotalCuenta(lista),
      propina: c.propina,
      estadoPago: c.estadoPago,
      rondas: await rondasDTO(repos, lista),
      pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, recibido: p.recibido, cambio: p.cambio, referencia: p.referencia, creadoEn: p.creadoEn.toISOString() })),
    }
  }

  /** Carga la cuenta y verifica que el actor opere en su sede. Sin permiso se responde «no existe». */
  async function cuentaDeSede(actor: Actor, id: string): Promise<CuentaRegistro> {
    const c = await uow.repos.mesas.cuenta(id)
    if (!c) throw err.noEncontrado('No encontramos esa cuenta')
    exigirSede(actor, c.sedeId)
    return c
  }

  return {
    /** Plano del salón: cada mesa con su estado y lo que la cocina tiene listo para servir. */
    async salon(actor: Actor, sedeId: string): Promise<SalonDTO> {
      exigirPermiso(actor, 'mesas.ver')
      exigirSede(actor, sedeId)
      const sede = await uow.repos.sedes.porId(sedeId)
      if (!sede) throw err.noEncontrado('La sede no existe')
      const [mesas, cuentas] = await Promise.all([uow.repos.mesas.mesas(sedeId), uow.repos.mesas.cuentasAbiertas(sedeId)])
      const rondas = await rondasDe(uow.repos, cuentas.map((c) => c.id))
      const porMesa = new Map(cuentas.map((c) => [c.mesaId, c]))
      const salida: MesaSalonDTO[] = mesas.map((m) => {
        const c = porMesa.get(m.id) ?? null
        const rs = c ? (rondas.get(c.id) ?? []) : []
        return { ...aMesaDTO(m), estado: estadoDeMesa(c, rs), cuenta: c ? resumen(c, rs) : null }
      })
      const listas = [...rondas.values()].flat().filter((r) => r.estado === 'listo').sort((a, b) => a.actualizadoEn.getTime() - b.actualizadoEn.getTime())
      return { sede: { id: sede.id, nombre: sede.nombre }, mesas: salida, paraServir: await rondasDTO(uow.repos, listas) }
    },

    /** Abre la cuenta de una mesa libre. Si otro mesero la acaba de abrir, devuelve esa misma cuenta. */
    async abrir(actor: Actor, sedeId: string, e: { mesaId: string; comensales: number }, ctx: ContextoSolicitud): Promise<CuentaMesaDTO> {
      const a = exigirPermiso(actor, 'mesas.atender')
      exigirSede(a, sedeId)
      const mesa = await uow.repos.mesas.mesa(e.mesaId)
      if (!mesa || mesa.sedeId !== sedeId) throw err.noEncontrado('Esa mesa no existe en esta sede')
      if (!mesa.activa) throw err.validacion('Esa mesa está fuera de servicio')
      let cuenta = await uow.repos.mesas.cuentaAbiertaDeMesa(mesa.id)
      if (!cuenta) {
        try {
          cuenta = await uow.repos.mesas.abrirCuenta({ sedeId, mesaId: mesa.id, meseroId: a.id, comensales: e.comensales })
          d.log.info({ mesa: mesa.numero, ip: ctx.ip ? 'registrada' : null }, 'Mesa abierta')
        } catch (error) {
          if (!esUnicidad(error)) throw error
          cuenta = await uow.repos.mesas.cuentaAbiertaDeMesa(mesa.id)
          if (!cuenta) throw error
        }
        d.eventos.cuentaActualizada(sedeId, cuenta.id)
      }
      return cuentaDTO(uow.repos, cuenta)
    },

    async detalle(actor: Actor, cuentaId: string): Promise<CuentaMesaDTO> {
      exigirPermiso(actor, 'mesas.ver')
      return cuentaDTO(uow.repos, await cuentaDeSede(actor, cuentaId))
    },

    /** Personas en la mesa y «pedir la cuenta» (o cancelar la solicitud porque siguen pidiendo). */
    async actualizar(actor: Actor, cuentaId: string, e: { comensales?: number | undefined; cuentaPedida?: boolean | undefined }, ctx: ContextoSolicitud): Promise<CuentaMesaDTO> {
      exigirPermiso(actor, 'mesas.atender')
      const c = await cuentaDeSede(actor, cuentaId)
      if (c.estado !== 'abierta') throw err.conflicto('La cuenta de esta mesa ya se cerró')
      if (e.cuentaPedida) {
        const rondas = (await rondasDe(uow.repos, [c.id])).get(c.id) ?? []
        if (subtotalCuenta(rondas) === 0) throw err.validacion('Todavía no hay nada que cobrar en esta mesa')
      }
      await uow.repos.mesas.actualizarCuenta(c.id, {
        ...(e.comensales !== undefined ? { comensales: e.comensales } : {}),
        ...(e.cuentaPedida !== undefined ? { cuentaPedidaEn: e.cuentaPedida ? (c.cuentaPedidaEn ?? reloj.ahora()) : null } : {}),
      })
      void ctx
      d.eventos.cuentaActualizada(c.sedeId, c.id)
      return cuentaDTO(uow.repos, (await uow.repos.mesas.cuenta(c.id))!)
    },

    /** Libera una mesa que se abrió por error o se fue sin pedir (sin rondas activas). */
    async liberar(actor: Actor, cuentaId: string, ctx: ContextoSolicitud): Promise<CuentaMesaDTO> {
      const a = exigirPermiso(actor, 'mesas.atender')
      await uow.transaccion(async (repos) => {
        const c = await repos.mesas.cuenta(cuentaId, { bloquear: true })
        if (!c) throw err.noEncontrado('No encontramos esa cuenta')
        exigirSede(a, c.sedeId)
        if (c.estado !== 'abierta') throw err.conflicto('La cuenta de esta mesa ya se cerró')
        const rondas = (await rondasDe(repos, [c.id])).get(c.id) ?? []
        if (rondas.some((r) => r.estado !== 'cancelado')) throw err.validacion('La mesa tiene pedidos: para liberarla, la caja debe cobrar la cuenta')
        await repos.mesas.actualizarCuenta(c.id, { estado: 'cancelada', cerradaEn: reloj.ahora(), cerradaPor: a.id })
        await auditar(repos, a, 'cuenta.liberar', 'cuenta_mesa', c.id, { mesa: c.mesaNumero }, ctx.ip)
      })
      const c = (await uow.repos.mesas.cuenta(cuentaId))!
      d.eventos.cuentaActualizada(c.sedeId, c.id)
      return cuentaDTO(uow.repos, c)
    },

    /**
     * Cobra la mesa en un solo paso: valida que no quede nada en la cocina ni por servir, que los pagos
     * sumen el consumo más la propina, registra los pagos y cierra la cuenta y sus rondas.
     */
    async cobrar(actor: Actor, cuentaId: string, e: CobrarCuentaInput, ctx: ContextoSolicitud): Promise<CuentaMesaDTO> {
      const a = exigirPermiso(actor, 'pedidos.cobrar')
      const ahora = reloj.ahora()
      const rondasCerradas: PedidoMesaRegistro[] = []
      await uow.transaccion(async (repos) => {
        const c = await repos.mesas.cuenta(cuentaId, { bloquear: true })
        if (!c) throw err.noEncontrado('No encontramos esa cuenta')
        exigirSede(a, c.sedeId)
        if (c.estado !== 'abierta') throw err.conflicto('Esta cuenta ya se cobró o se liberó')
        const rondas = (await rondasDe(repos, [c.id])).get(c.id) ?? []
        const pendientes = rondasSinServir(rondas)
        if (pendientes > 0) {
          throw new ErrorDominio('VALIDACION', pendientes === 1 ? 'Hay una ronda sin servir: sírvela o cancélala antes de cobrar' : `Hay ${pendientes} rondas sin servir: sírvelas o cancélalas antes de cobrar`)
        }
        const subtotal = subtotalCuenta(rondas)
        const pagos = validarCobroMesa(e.pagos, subtotal, e.propina)
        for (const p of pagos) {
          await repos.mesas.registrarPago({ cuentaId: c.id, metodo: p.metodo, monto: p.monto, recibido: p.recibido, cambio: p.cambio, referencia: p.referencia ?? null, registradoPor: a.id })
        }
        await repos.mesas.actualizarCuenta(c.id, { estado: 'cerrada', estadoPago: 'pagado', propina: e.propina, cerradaEn: ahora, cerradaPor: a.id })
        for (const r of rondas) {
          await repos.pedidos.actualizar(r.id, { ...(r.estado === 'cancelado' ? {} : { estadoPago: 'pagado' }), cerradoEn: ahora, cerradoPor: a.id })
          rondasCerradas.push(r)
        }
        await auditar(repos, a, 'cuenta.cobrar', 'cuenta_mesa', c.id, { mesa: c.mesaNumero, subtotal, propina: e.propina, pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })) }, ctx.ip)
      })
      const c = (await uow.repos.mesas.cuenta(cuentaId))!
      d.eventos.cuentaActualizada(c.sedeId, c.id)
      d.log.info({ mesa: c.mesaNumero, rondas: rondasCerradas.length, ip: ctx.ip ? 'registrada' : null }, 'Mesa cobrada')
      return cuentaDTO(uow.repos, c)
    },

    // --- Administración de mesas -------------------------------------------------------

    async listarMesas(actor: Actor, sedeId: string): Promise<MesaDTO[]> {
      exigirPermiso(actor, 'mesas.gestionar')
      if (!(await uow.repos.sedes.porId(sedeId))) throw err.noEncontrado('La sede no existe')
      return (await uow.repos.mesas.mesas(sedeId, { incluirInactivas: true })).map(aMesaDTO)
    },

    async crearMesa(actor: Actor, sedeId: string, e: MesaInput, ctx: ContextoSolicitud): Promise<MesaDTO> {
      const a = exigirPermiso(actor, 'mesas.gestionar')
      if (!(await uow.repos.sedes.porId(sedeId))) throw err.noEncontrado('La sede no existe')
      try {
        const m = await uow.transaccion(async (repos) => {
          const nueva = await repos.mesas.crearMesa({ sedeId, numero: e.numero, zona: e.zona?.trim() || null, puestos: e.puestos, activa: e.activa })
          await auditar(repos, a, 'mesa.crear', 'mesa', nueva.id, { sedeId, numero: e.numero }, ctx.ip)
          return nueva
        })
        return aMesaDTO(m)
      } catch (error) {
        if (esUnicidad(error)) throw err.conflicto(`Ya existe la mesa ${e.numero} en esta sede`, { campo: 'numero' })
        throw error
      }
    },

    async actualizarMesa(actor: Actor, id: string, e: MesaInput, ctx: ContextoSolicitud): Promise<MesaDTO> {
      const a = exigirPermiso(actor, 'mesas.gestionar')
      const m = await uow.repos.mesas.mesa(id)
      if (!m) throw err.noEncontrado('Esa mesa no existe')
      if (!e.activa && m.activa && (await uow.repos.mesas.cuentaAbiertaDeMesa(id))) {
        throw err.validacion('La mesa tiene una cuenta abierta: cóbrala o libérala antes de sacarla de servicio')
      }
      try {
        await uow.transaccion(async (repos) => {
          await repos.mesas.actualizarMesa(id, { numero: e.numero, zona: e.zona?.trim() || null, puestos: e.puestos, activa: e.activa })
          await auditar(repos, a, 'mesa.actualizar', 'mesa', id, { antes: aMesaDTO(m), despues: { numero: e.numero, zona: e.zona ?? null, puestos: e.puestos, activa: e.activa } }, ctx.ip)
        })
      } catch (error) {
        if (esUnicidad(error)) throw err.conflicto(`Ya existe la mesa ${e.numero} en esta sede`, { campo: 'numero' })
        throw error
      }
      return aMesaDTO((await uow.repos.mesas.mesa(id))!)
    },
  }
}

export type CasosMesas = ReturnType<typeof crearCasosMesas>

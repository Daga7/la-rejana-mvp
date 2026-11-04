import {
  ALFABETO_PASAPORTE,
  LARGO_CODIGO_PASAPORTE,
  VERSION_TERMINOS_PASAPORTE,
  type ConfigPasaporteDTO,
  type ConfigPasaporteInput,
  type ConsultaPasaporteDTO,
  type PasaporteClienteDTO,
  type ProgramaPasaporteDTO,
} from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { exigirPermiso, exigirSede, exigirUsuario, type Actor, type ActorUsuario } from '../domain/permisos'
import { esDomicilio, esMesa, subtotalCuenta } from '../domain/pedido'
import { resolverPeriodo } from '../domain/periodos'
import type { ConfigPasaporte, PedidoRegistro, Repositorios, UnidadDeTrabajo } from '../ports/repositorios'
import type { Criptografia, Logger, PublicadorEventos, Reloj } from '../ports/servicios'
import { auditar, type ContextoSolicitud } from './comun'
import type { CasosPedidos } from './pedidos'

export interface DepsPasaporte {
  uow: UnidadDeTrabajo
  reloj: Reloj
  cripto: Criptografia
  eventos: PublicadorEventos
  log: Logger
  pedidos: CasosPedidos
}

const DIA = 86_400_000
/** La caja puede sellar una mesa hasta 48 horas después de cobrarla (si el cliente olvidó su código). */
const HORAS_PARA_SELLAR = 48

function esUnicidad(error: unknown): boolean {
  const codigo = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code
  return codigo === '23505'
}

/** Fecha desde la que un sello sigue vigente (meses de 30 días, como en el demo); null si no vencen. */
export function inicioVigencia(ahora: Date, vigenciaMeses: number): Date | null {
  return vigenciaMeses > 0 ? new Date(ahora.getTime() - vigenciaMeses * 30 * DIA) : null
}

const aPrograma = (c: ConfigPasaporte): ProgramaPasaporteDTO => ({
  activo: c.activo,
  sellosParaPremio: c.sellosParaPremio,
  montoMinimo: c.montoMinimo,
  premioNombre: c.premioNombre,
  premioDescripcion: c.premioDescripcion,
  vigenciaMeses: c.vigenciaMeses,
})

/**
 * Pasaporte de sellos. Solo para clientes registrados que lo activan con autorización expresa (Ley 1581):
 * en la caja se identifican con un código personal y el personal solo ve su nombre de pila y sus sellos.
 * Un sello por compra pagada (índices únicos en la base); el premio se canjea en la caja como una ronda de
 * precio cero, que la cocina prepara y descuenta del inventario.
 */
export function crearCasosPasaporte(d: DepsPasaporte) {
  const { uow, reloj } = d

  function exigirCliente(actor: Actor): ActorUsuario {
    const a = exigirUsuario(actor)
    if (a.rol !== 'cliente') throw err.prohibido('El Pasaporte es para clientes con cuenta')
    return a
  }

  async function nuevoCodigo(repos: Repositorios): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const codigo = d.cripto.codigoAlfabeto(ALFABETO_PASAPORTE, LARGO_CODIGO_PASAPORTE)
      if (!(await repos.pasaporte.porCodigo(codigo))) return codigo
    }
    throw new Error('No se pudo generar un código de pasaporte único')
  }

  /** El cliente del código, si el programa está activo. Respuesta genérica si no existe (no confirma códigos). */
  async function clienteDelCodigo(repos: Repositorios, codigo: string) {
    const config = await repos.pasaporte.config()
    if (!config.activo) throw new ErrorDominio('VALIDACION', 'El Pasaporte de sellos está apagado')
    const p = await repos.pasaporte.porCodigo(codigo)
    if (!p || !p.clienteActivo) throw err.noEncontrado('No encontramos ese código de pasaporte')
    return { p, config }
  }

  async function sellosVigentes(repos: Repositorios, clienteId: string, config: ConfigPasaporte, bloquear = false) {
    return repos.pasaporte.sellosVigentes(clienteId, inicioVigencia(reloj.ahora(), config.vigenciaMeses), { bloquear })
  }

  async function miPasaporte(actor: Actor): Promise<PasaporteClienteDTO> {
    const a = exigirCliente(actor)
    const config = await uow.repos.pasaporte.config()
    const p = await uow.repos.pasaporte.deCliente(a.id)
    if (!p) return { programa: aPrograma(config), inscrito: false, codigo: null, sellosVigentes: 0, premiosDisponibles: 0, proximoVencimiento: null, historial: [] }
    const vigentes = await sellosVigentes(uow.repos, a.id, config)
    const historial = await uow.repos.pasaporte.historial(a.id, 30)
    const masViejo = vigentes[0]
    return {
      programa: aPrograma(config),
      inscrito: true,
      codigo: p.codigo,
      sellosVigentes: vigentes.length,
      premiosDisponibles: Math.floor(vigentes.length / config.sellosParaPremio),
      proximoVencimiento: masViejo && config.vigenciaMeses > 0 ? new Date(masViejo.creadoEn.getTime() + config.vigenciaMeses * 30 * DIA).toISOString() : null,
      historial: historial.map((h) => ({ ...h, fecha: h.fecha.toISOString() })),
    }
  }

  /** Lo único que ve la caja con el código: nombre de pila y sellos. */
  async function consultar(actor: Actor, codigo: string): Promise<ConsultaPasaporteDTO> {
    exigirPermiso(actor, 'pasaporte.otorgar')
    const { p, config } = await clienteDelCodigo(uow.repos, codigo)
    const vigentes = await sellosVigentes(uow.repos, p.clienteId, config)
    return {
      nombre: p.clienteNombre.split(' ')[0] ?? p.clienteNombre,
      sellosVigentes: vigentes.length,
      sellosParaPremio: config.sellosParaPremio,
      premiosDisponibles: Math.floor(vigentes.length / config.sellosParaPremio),
      premioNombre: config.premioNombre,
    }
  }

  async function configuracion(actor: Actor): Promise<ConfigPasaporteDTO> {
    exigirPermiso(actor, 'pasaporte.gestionar')
    const config = await uow.repos.pasaporte.config()
    const mes = resolverPeriodo({ periodo: 'este_mes' }, reloj.ahora())
    return { ...aPrograma(config), premioProductoId: config.premioProductoId, estadisticas: await uow.repos.pasaporte.estadisticas(mes.desde) }
  }

  return {
    /** Reglas del programa (públicas, sin datos personales): para explicarlo antes de crear la cuenta. */
    async programa(): Promise<ProgramaPasaporteDTO> {
      return aPrograma(await uow.repos.pasaporte.config())
    },

    // --- Cliente -----------------------------------------------------------------------------

    miPasaporte,

    /** Activa el pasaporte con la autorización expresa del cliente (queda la fecha y la versión aceptada). */
    async inscribir(actor: Actor, ctx: ContextoSolicitud): Promise<PasaporteClienteDTO> {
      const a = exigirCliente(actor)
      if (!(await uow.repos.pasaporte.deCliente(a.id))) {
        try {
          await uow.repos.pasaporte.inscribir({ clienteId: a.id, codigo: await nuevoCodigo(uow.repos), aceptadoEn: reloj.ahora(), versionTerminos: VERSION_TERMINOS_PASAPORTE })
        } catch (error) {
          if (!esUnicidad(error)) throw error
        }
        d.log.info({ ip: ctx.ip ? 'registrada' : null }, 'Pasaporte activado')
      }
      return miPasaporte(actor)
    },

    /** Código nuevo (si el cliente cree que alguien vio el suyo). */
    async cambiarCodigo(actor: Actor): Promise<PasaporteClienteDTO> {
      const a = exigirCliente(actor)
      if (!(await uow.repos.pasaporte.deCliente(a.id))) throw err.noEncontrado('Primero activa tu pasaporte')
      await uow.repos.pasaporte.cambiarCodigo(a.id, await nuevoCodigo(uow.repos))
      return miPasaporte(actor)
    },

    /** Salir del programa: se borran la inscripción y los sellos (derecho de supresión, Ley 1581). */
    async salir(actor: Actor, ctx: ContextoSolicitud): Promise<void> {
      const a = exigirCliente(actor)
      await uow.transaccion(async (repos) => {
        if (!(await repos.pasaporte.deCliente(a.id))) return
        await repos.pasaporte.eliminar(a.id)
        await auditar(repos, a, 'pasaporte.salir', 'pasaporte', a.id, null, ctx.ip)
      })
    },

    // --- Caja --------------------------------------------------------------------------------

    consultar,

    /** Sello por una mesa ya cobrada de la sede (hasta 48 h después), si la compra llega al mínimo. */
    async sellarCuenta(actor: Actor, e: { codigo: string; cuentaId: string }, ctx: ContextoSolicitud): Promise<ConsultaPasaporteDTO> {
      const a = exigirPermiso(actor, 'pasaporte.otorgar')
      await uow.transaccion(async (repos) => {
        const { p, config } = await clienteDelCodigo(repos, e.codigo)
        const c = await repos.mesas.cuenta(e.cuentaId, { bloquear: true })
        if (!c) throw err.noEncontrado('No encontramos esa cuenta')
        exigirSede(a, c.sedeId)
        if (c.estado !== 'cerrada' || c.estadoPago !== 'pagado' || !c.cerradaEn) throw err.validacion('Solo se sella una mesa ya cobrada')
        if (reloj.ahora().getTime() - c.cerradaEn.getTime() > HORAS_PARA_SELLAR * 3_600_000) throw err.validacion(`El sello se da hasta ${HORAS_PARA_SELLAR} horas después de cobrar la mesa`)
        const rondas = (await repos.pedidos.listar({ canal: 'mesa', cuentaIds: [c.id], limite: 200 })).filter(esMesa)
        const consumo = subtotalCuenta(rondas)
        if (consumo < config.montoMinimo) throw err.validacion(`La compra mínima para ganar un sello es de ${config.montoMinimo}`, { minimo: config.montoMinimo })
        try {
          await repos.pasaporte.crearSello({ clienteId: p.clienteId, sedeId: c.sedeId, pedidoId: null, cuentaId: c.id, monto: consumo, otorgadoPor: a.id })
        } catch (error) {
          if (esUnicidad(error)) throw err.conflicto('Esta mesa ya tiene su sello')
          throw error
        }
        await auditar(repos, a, 'pasaporte.sellar', 'cuenta_mesa', c.id, { mesa: c.mesaNumero, monto: consumo }, ctx.ip)
      })
      return consultar(actor, e.codigo)
    },

    /**
     * Sello automático al cerrar en caja un domicilio pagado de un cliente inscrito (misma transacción del
     * cierre). Si el pedido no califica, no hace nada.
     */
    async sellarPedidoAlCerrar(repos: Repositorios, p: PedidoRegistro, actorId: string): Promise<void> {
      if (!esDomicilio(p) || !p.clienteId || p.estado !== 'entregado' || p.estadoPago !== 'pagado') return
      const config = await repos.pasaporte.config()
      if (!config.activo || p.subtotal < config.montoMinimo) return
      if (!(await repos.pasaporte.deCliente(p.clienteId))) return
      try {
        await repos.pasaporte.crearSello({ clienteId: p.clienteId, sedeId: p.sedeId, pedidoId: p.id, cuentaId: null, monto: p.subtotal, otorgadoPor: actorId })
      } catch (error) {
        if (!esUnicidad(error)) throw error
      }
    },

    /**
     * Canjea un premio en una mesa abierta: gasta los sellos vigentes más antiguos y agrega el premio como
     * una ronda de precio cero (la cocina lo prepara y descuenta el inventario), todo en una transacción.
     */
    async canjear(actor: Actor, e: { codigo: string; cuentaId: string }, ctx: ContextoSolicitud): Promise<ConsultaPasaporteDTO> {
      const a = exigirPermiso(actor, 'pasaporte.otorgar')
      let premio: PedidoRegistro | null = null
      let sedeId = ''
      await uow.transaccion(async (repos) => {
        const c = await repos.mesas.cuenta(e.cuentaId, { bloquear: true })
        if (!c) throw err.noEncontrado('No encontramos esa cuenta')
        exigirSede(a, c.sedeId)
        if (c.estado !== 'abierta') throw err.conflicto('El premio se canjea en una mesa abierta')
        const { p, config } = await clienteDelCodigo(repos, e.codigo)
        if (!config.premioProductoId || !config.premioNombre) throw err.validacion('El administrador aún no eligió el premio')
        const vigentes = await sellosVigentes(repos, p.clienteId, config, true)
        if (vigentes.length < config.sellosParaPremio) {
          throw err.validacion(`${p.clienteNombre.split(' ')[0]} tiene ${vigentes.length} de ${config.sellosParaPremio} sellos: todavía no completa el premio`)
        }
        premio = await d.pedidos.rondaPremio(repos, a, c, config.premioProductoId)
        const canjeId = await repos.pasaporte.crearCanje({ clienteId: p.clienteId, sedeId: c.sedeId, cuentaId: c.id, pedidoId: premio.id, sellosUsados: config.sellosParaPremio, premioNombre: config.premioNombre, canjeadoPor: a.id })
        await repos.pasaporte.marcarCanjeados(vigentes.slice(0, config.sellosParaPremio).map((s) => s.id), canjeId)
        await auditar(repos, a, 'pasaporte.canjear', 'cuenta_mesa', c.id, { mesa: c.mesaNumero, premio: config.premioNombre, sellos: config.sellosParaPremio }, ctx.ip)
        sedeId = c.sedeId
      })
      if (premio) await d.pedidos.publicar((premio as PedidoRegistro).id)
      d.eventos.menuCambio(sedeId)
      return consultar(actor, e.codigo)
    },

    // --- Administración ------------------------------------------------------------------------

    configuracion,

    async guardarConfiguracion(actor: Actor, e: ConfigPasaporteInput, ctx: ContextoSolicitud): Promise<ConfigPasaporteDTO> {
      const a = exigirPermiso(actor, 'pasaporte.gestionar')
      if (e.premioProductoId && !(await uow.repos.catalogo.productos()).some((p) => p.id === e.premioProductoId && p.activo)) {
        throw err.validacion('Ese producto no existe o está inactivo', { campo: 'premioProductoId' })
      }
      await uow.transaccion(async (repos) => {
        const antes = await repos.pasaporte.config()
        await repos.pasaporte.guardarConfig(e, a.id)
        await auditar(repos, a, 'pasaporte.configurar', 'pasaporte', null, { antes: aPrograma(antes), despues: e }, ctx.ip)
      })
      return configuracion(actor)
    },
  }
}

export type CasosPasaporte = ReturnType<typeof crearCasosPasaporte>

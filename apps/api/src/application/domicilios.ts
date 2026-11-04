import { enlaceGoogleMaps, enlaceWaze, numero, type PedidoDTO, type PlanRutaDTO, type Punto } from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { exigirPermiso, type Actor, type ActorUsuario } from '../domain/permisos'
import { planificarRuta } from '../domain/ruta'
import type { PedidoRegistro, Recorrido, UnidadDeTrabajo } from '../ports/repositorios'
import type { Logger, MatrizTiempos, PublicadorEventos, Reloj } from '../ports/servicios'
import type { ContextoSolicitud } from './comun'
import { aPedidoDTO, type CasosPedidos } from './pedidos'

export const MINUTOS_POR_PARADA = 3
const INTERVALO_MIN_UBICACION_MS = 2_000
const INTERVALO_GUARDADO_MS = 15_000
const INTERVALO_RECALCULO_ETA_MS = 30_000

export interface DepsDomicilios {
  uow: UnidadDeTrabajo
  reloj: Reloj
  mapas: MatrizTiempos
  eventos: PublicadorEventos
  log: Logger
  pedidos: () => CasosPedidos
}

interface EstadoRecorrido {
  ultimaUbicacion: number
  ultimoGuardado: number
  ultimoCalculo: number
  /** Minutos estimados de llegada por pedido, calculados en `ultimoCalculo`. */
  etas: Map<string, number>
}

export function crearCasosDomicilios(d: DepsDomicilios) {
  const { uow, reloj, log } = d
  // Estado vivo en memoria (un solo proceso; ver D17). La ubicación persistida se borra al terminar.
  const vivos = new Map<string, EstadoRecorrido>()
  const etaPorPedido = new Map<string, { minutos: number; calculadoEn: number }>()

  function exigirDomiciliario(actor: Actor): ActorUsuario {
    const a = exigirPermiso(actor, 'domicilios.recorrer')
    return a
  }

  async function pedidosAsignados(actor: ActorUsuario, ids: string[]): Promise<PedidoRegistro[]> {
    const unicos = [...new Set(ids)]
    const lista: PedidoRegistro[] = []
    for (const id of unicos) {
      const p = await uow.repos.pedidos.porId(id)
      if (!p || p.domiciliarioId !== actor.id) throw err.prohibido('Uno de los pedidos no está asignado a ti')
      lista.push(p)
    }
    if (new Set(lista.map((p) => p.sedeId)).size > 1) throw err.validacion('Los pedidos deben ser de la misma sede')
    return lista
  }

  /** ETA vigente de un pedido (descuenta el tiempo transcurrido desde el último cálculo). */
  function eta(pedidoId: string): number | null {
    const e = etaPorPedido.get(pedidoId)
    if (!e) return null
    const transcurrido = (reloj.ahora().getTime() - e.calculadoEn) / 60_000
    return Math.max(1, Math.round(e.minutos - transcurrido))
  }

  function limpiarPedido(pedidoId: string) {
    etaPorPedido.delete(pedidoId)
    d.eventos.finUbicacion(pedidoId)
  }

  async function finalizar(r: Recorrido) {
    await uow.repos.recorridos.finalizar(r.id, reloj.ahora())
    vivos.delete(r.id)
    for (const id of r.ordenParadas) limpiarPedido(id)
  }

  return {
    eta,

    async misPedidos(actor: Actor) {
      const a = exigirDomiciliario(actor)
      const [lista, recorrido] = await Promise.all([
        uow.repos.pedidos.listar({ domiciliarioId: a.id, estados: ['recibido', 'en_preparacion', 'listo', 'en_camino'], limite: 50 }),
        uow.repos.recorridos.activoDe(a.id),
      ])
      const items = await uow.repos.pedidos.items(lista.map((p) => p.id))
      const pedidos: PedidoDTO[] = lista.map((p) => aPedidoDTO(p, items.get(p.id) ?? [], [], eta(p.id)))
      const sede = a.sedeId ? await uow.repos.sedes.porId(a.sedeId) : null
      return {
        pedidos,
        recorrido: recorrido ? { id: recorrido.id, ordenParadas: recorrido.ordenParadas, iniciadoEn: recorrido.iniciadoEn.toISOString() } : null,
        sede: sede ? { id: sede.id, nombre: sede.nombre, lat: sede.lat, lng: sede.lng, limiteMinutosEntrega: sede.limiteMinutosEntrega } : null,
      }
    },

    /** Ruta óptima para un grupo de pedidos listos, con el límite de minutos de la sede. */
    async planificar(actor: Actor, pedidoIds: string[]): Promise<PlanRutaDTO> {
      const a = exigirDomiciliario(actor)
      const pedidos = await pedidosAsignados(a, pedidoIds)
      const noListos = pedidos.filter((p) => p.estado !== 'listo')
      if (noListos.length) throw new ErrorDominio('TRANSICION_INVALIDA', `El pedido #${noListos[0]!.numero} todavía no está listo para salir`)
      const sede = await uow.repos.sedes.porId(pedidos[0]!.sedeId)
      if (!sede) throw err.noEncontrado('La sede no existe')
      const puntos: Punto[] = [{ lat: sede.lat, lng: sede.lng }, ...pedidos.map((p) => ({ lat: p.lat, lng: p.lng }))]
      const matriz = await d.mapas.minutos(puntos)
      const opciones = { limiteMinutos: sede.limiteMinutosEntrega, minutosPorParada: MINUTOS_POR_PARADA }
      const plan = planificarRuta(matriz, opciones)
      const todoJunto = plan.dividir ? planificarRuta(matriz, { ...opciones, limiteMinutos: Number.POSITIVE_INFINITY }).salidas[0] : plan.salidas[0]

      const salidas = plan.salidas.map((s) => {
        const paradas = s.orden.map((idx, k) => {
          const p = pedidos[idx - 1]!
          return { pedidoId: p.id, numero: p.numero, lat: p.lat, lng: p.lng, direccion: p.direccion, minutosLlegada: Math.round(s.llegadas[k]!), excedeLimite: s.llegadas[k]! > sede.limiteMinutosEntrega }
        })
        return {
          paradas,
          minutosTotales: Math.round(s.minutosTotales),
          cumpleLimite: s.cumpleLimite,
          enlaceGoogleMaps: enlaceGoogleMaps({ lat: sede.lat, lng: sede.lng }, paradas),
          enlaceWaze: enlaceWaze(paradas[0]!),
        }
      })
      let mensaje: string
      if (!plan.dividir) mensaje = `Ruta óptima: ${pedidos.length} ${pedidos.length === 1 ? 'entrega' : 'entregas'} en unos ${salidas[0]?.minutosTotales ?? 0} min (límite ${sede.limiteMinutosEntrega} min).`
      else {
        mensaje = `Con todos juntos la última entrega llegaría en ${Math.round(todoJunto?.minutosTotales ?? 0)} min y el límite es ${sede.limiteMinutosEntrega}. Te sugerimos ${salidas.length} salidas para que la comida llegue caliente.`
      }
      if (plan.inalcanzables.length) {
        const nums = plan.inalcanzables.map((i) => `#${pedidos[i - 1]!.numero}`).join(', ')
        mensaje += ` Ojo: ${nums} queda a más de ${numero(sede.limiteMinutosEntrega)} min incluso yendo directo.`
      }
      return { limiteMinutos: sede.limiteMinutosEntrega, salidas, dividir: plan.dividir, mensaje }
    },

    /** Sale con un grupo de pedidos (en el orden de la ruta): pasan a «en camino» y empieza el seguimiento. */
    async iniciarRecorrido(actor: Actor, pedidoIds: string[], ctx: ContextoSolicitud) {
      const a = exigirDomiciliario(actor)
      const pedidos = await pedidosAsignados(a, pedidoIds)
      if (await uow.repos.recorridos.activoDe(a.id)) throw err.conflicto('Ya tienes un recorrido en curso. Termínalo antes de salir otra vez.')
      const ahora = reloj.ahora()
      const recorrido = await uow.transaccion(async (repos) => {
        const r = await repos.recorridos.crear({ sedeId: pedidos[0]!.sedeId, domiciliarioId: a.id, ordenParadas: [...new Set(pedidoIds)] })
        for (const id of r.ordenParadas) {
          const p = await repos.pedidos.porId(id, { bloquear: true })
          if (!p || p.estado !== 'listo' || p.domiciliarioId !== a.id) throw new ErrorDominio('TRANSICION_INVALIDA', 'Uno de los pedidos ya no está listo para salir')
          await repos.pedidos.actualizar(id, { estado: 'en_camino', enCaminoEn: ahora, recorridoId: r.id })
          await repos.pedidos.registrarEvento({ pedidoId: id, estado: 'en_camino', actorId: a.id, actorRol: a.rol, nota: null })
        }
        return r
      })
      vivos.set(recorrido.id, { ultimaUbicacion: 0, ultimoGuardado: 0, ultimoCalculo: 0, etas: new Map() })
      for (const id of recorrido.ordenParadas) await d.pedidos().publicar(id)
      log.info({ recorrido: recorrido.id, pedidos: recorrido.ordenParadas.length, ip: ctx.ip ? 'ok' : null }, 'Recorrido iniciado')
      return { id: recorrido.id, ordenParadas: recorrido.ordenParadas }
    },

    /**
     * Ubicación del domiciliario. Solo se acepta con un recorrido activo y solo se envía a las salas de
     * los pedidos de ese recorrido que siguen «en camino» (privacidad: nadie más la ve).
     */
    async actualizarUbicacion(actor: Actor, u: { lat: number; lng: number; precision?: number }) {
      const a = exigirDomiciliario(actor)
      const recorrido = await uow.repos.recorridos.activoDe(a.id)
      if (!recorrido) throw new ErrorDominio('CONFLICTO', 'No tienes un recorrido activo')
      const ahora = reloj.ahora().getTime()
      const vivo = vivos.get(recorrido.id) ?? { ultimaUbicacion: 0, ultimoGuardado: 0, ultimoCalculo: 0, etas: new Map<string, number>() }
      vivos.set(recorrido.id, vivo)
      if (ahora - vivo.ultimaUbicacion < INTERVALO_MIN_UBICACION_MS) return { aceptada: false }
      vivo.ultimaUbicacion = ahora
      if (ahora - vivo.ultimoGuardado >= INTERVALO_GUARDADO_MS) {
        vivo.ultimoGuardado = ahora
        await uow.repos.recorridos.guardarUbicacion(recorrido.id, u.lat, u.lng, new Date(ahora))
      }

      const enCamino = (await uow.repos.pedidos.listar({ recorridoId: recorrido.id, estados: ['en_camino'] })).sort((x, y) => recorrido.ordenParadas.indexOf(x.id) - recorrido.ordenParadas.indexOf(y.id))
      if (enCamino.length === 0) return { aceptada: true, pendientes: 0 }

      // ETA: recalcula con el proveedor de mapas cada 30 s; entre tanto, descuenta el tiempo transcurrido.
      if (ahora - vivo.ultimoCalculo >= INTERVALO_RECALCULO_ETA_MS || enCamino.some((p) => !etaPorPedido.has(p.id))) {
        vivo.ultimoCalculo = ahora
        const matriz = await d.mapas.minutos([{ lat: u.lat, lng: u.lng }, ...enCamino.map((p) => ({ lat: p.lat, lng: p.lng }))])
        let acumulado = 0
        enCamino.forEach((p, k) => {
          acumulado += (k === 0 ? 0 : MINUTOS_POR_PARADA) + matriz[k]![k + 1]!
          etaPorPedido.set(p.id, { minutos: acumulado, calculadoEn: ahora })
        })
      }
      const fecha = new Date(ahora).toISOString()
      for (const p of enCamino) d.eventos.ubicacion(p.id, { pedidoId: p.id, lat: u.lat, lng: u.lng, etaMinutos: eta(p.id), fecha })
      return { aceptada: true, pendientes: enCamino.length }
    },

    /** Marca la entrega; si era la última del recorrido, el recorrido termina y la ubicación se borra. */
    async entregar(actor: Actor, pedidoId: string, ctx: ContextoSolicitud): Promise<PedidoDTO> {
      const pedido = await d.pedidos().cambiarEstado(actor, pedidoId, { estado: 'entregado' }, ctx)
      limpiarPedido(pedidoId)
      if (pedido.recorridoId) {
        const r = await uow.repos.recorridos.porId(pedido.recorridoId)
        if (r && r.estado === 'activo') {
          const pendientes = await uow.repos.pedidos.listar({ recorridoId: r.id, estados: ['en_camino'] })
          if (pendientes.length === 0) await finalizar(r)
        }
      }
      return pedido
    },

    async finalizarRecorrido(actor: Actor) {
      const a = exigirDomiciliario(actor)
      const r = await uow.repos.recorridos.activoDe(a.id)
      if (!r) return { finalizado: false }
      const pendientes = await uow.repos.pedidos.listar({ recorridoId: r.id, estados: ['en_camino'] })
      if (pendientes.length) throw err.validacion(`Aún tienes ${pendientes.length} ${pendientes.length === 1 ? 'pedido' : 'pedidos'} en camino. Márcalos como entregados o avisa a la caja.`)
      await finalizar(r)
      return { finalizado: true }
    },

    /** Si la caja cancela un pedido en camino, se deja de compartir la ubicación con ese cliente. */
    pedidoCerrado(pedidoId: string) {
      limpiarPedido(pedidoId)
    },
  }
}

export type CasosDomicilios = ReturnType<typeof crearCasosDomicilios>

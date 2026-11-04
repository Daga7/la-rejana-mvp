import { diaBogota, type EstadoPedido, type PeriodoReporte } from '@rejana/shared'
import { err } from '../domain/errores'
import { stockBajo } from '../domain/inventario'
import { diasEntre, resolverPeriodo, sumarDias, type RangoFechas } from '../domain/periodos'
import { exigirPermiso, type Actor } from '../domain/permisos'
import type { UnidadDeTrabajo } from '../ports/repositorios'
import type { Reloj } from '../ports/servicios'

// Catálogo CERRADO de reportes. Es lo único que pueden pedir el tablero y el asistente de WhatsApp:
// consultas fijas y parametrizadas, nunca SQL construido a partir de texto.

export interface ReporteVentas {
  rango: RangoFechas
  sedeNombre: string | null
  ventas: number
  pedidos: number
  ticketPromedio: number
  porDia: { dia: string; ventas: number; pedidos: number }[]
  porSede: { sedeId: string; sedeNombre: string; ventas: number; pedidos: number }[]
}

export interface ReporteProductos {
  rango: RangoFechas
  sedeNombre: string | null
  productos: { nombre: string; unidades: number; ventas: number }[]
}

export interface ReporteInventario {
  sedeNombre: string | null
  filtro: string | null
  filas: { sedeNombre: string; insumo: string; unidad: 'g' | 'ml' | 'und'; cantidad: number; stockMinimo: number; bajo: boolean }[]
}

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function crearCasosReportes(d: { uow: UnidadDeTrabajo; reloj: Reloj }) {
  const { uow, reloj } = d

  async function nombreSede(sedeId: string | null) {
    if (!sedeId) return null
    const s = await uow.repos.sedes.porId(sedeId)
    if (!s) throw err.noEncontrado('La sede no existe')
    return s.nombre
  }

  const casos = {
    async ventas(sedeId: string | null, rango: RangoFechas): Promise<ReporteVentas> {
      const [filas, sedes, sedeNombre] = await Promise.all([uow.repos.reportes.ventasPorDia({ sedeId, desde: rango.desde, hasta: rango.hasta }), uow.repos.sedes.todas(false), nombreSede(sedeId)])
      const porDiaMapa = new Map<string, { ventas: number; pedidos: number }>()
      const porSedeMapa = new Map<string, { ventas: number; pedidos: number }>()
      for (const f of filas) {
        const a = porDiaMapa.get(f.dia) ?? { ventas: 0, pedidos: 0 }
        porDiaMapa.set(f.dia, { ventas: a.ventas + f.ventas, pedidos: a.pedidos + f.pedidos })
        const b = porSedeMapa.get(f.sedeId) ?? { ventas: 0, pedidos: 0 }
        porSedeMapa.set(f.sedeId, { ventas: b.ventas + f.ventas, pedidos: b.pedidos + f.pedidos })
      }
      const ventas = filas.reduce((s, f) => s + f.ventas, 0)
      const pedidos = filas.reduce((s, f) => s + f.pedidos, 0)
      return {
        rango,
        sedeNombre,
        ventas,
        pedidos,
        ticketPromedio: pedidos ? Math.round(ventas / pedidos) : 0,
        porDia: diasEntre(rango.diaDesde, rango.diaHasta).map((dia) => ({ dia, ...(porDiaMapa.get(dia) ?? { ventas: 0, pedidos: 0 }) })),
        porSede: sedes
          .filter((s) => !sedeId || s.id === sedeId)
          .map((s) => ({ sedeId: s.id, sedeNombre: s.nombre, ...(porSedeMapa.get(s.id) ?? { ventas: 0, pedidos: 0 }) }))
          .sort((a, b) => b.ventas - a.ventas),
      }
    },

    async productosMasVendidos(sedeId: string | null, rango: RangoFechas, limite = 10): Promise<ReporteProductos> {
      const [filas, sedeNombre] = await Promise.all([uow.repos.reportes.productosMasVendidos({ sedeId, desde: rango.desde, hasta: rango.hasta, limite }), nombreSede(sedeId)])
      return { rango, sedeNombre, productos: filas.map((f) => ({ nombre: f.nombre, unidades: f.unidades, ventas: f.ventas })) }
    },

    async inventario(sedeId: string | null, filtro: string | null): Promise<ReporteInventario> {
      const sedes = (await uow.repos.sedes.todas(false)).filter((s) => !sedeId || s.id === sedeId)
      const buscado = filtro ? normalizar(filtro) : null
      const filas: ReporteInventario['filas'] = []
      for (const s of sedes) {
        for (const i of await uow.repos.inventario.deSede(s.id)) {
          if (buscado && !normalizar(i.insumoNombre).includes(buscado)) continue
          filas.push({ sedeNombre: s.nombre, insumo: i.insumoNombre, unidad: i.unidad, cantidad: i.cantidad, stockMinimo: i.stockMinimo, bajo: stockBajo(i.cantidad, i.stockMinimo) })
        }
      }
      return { sedeNombre: await nombreSede(sedeId), filtro, filas }
    },

    /** Resuelve el nombre de una sede escrito por una persona («villaluz», «Normandia») a su id. */
    async sedePorNombre(nombre: string | null): Promise<string | null> {
      if (!nombre) return null
      const n = normalizar(nombre)
      const sede = (await uow.repos.sedes.todas(false)).find((s) => normalizar(s.nombre) === n || normalizar(s.slug) === n || n.includes(normalizar(s.nombre)))
      if (!sede) throw err.noEncontrado(`No conozco la sede «${nombre}»`)
      return sede.id
    },

    rango(periodo: { periodo?: PeriodoReporte | null; desde?: string | null; hasta?: string | null }) {
      return resolverPeriodo(periodo, reloj.ahora())
    },
  }

  return {
    ...casos,

    /** Consulta de un reporte del catálogo por una persona (exige permiso de reportes). */
    async consultar(actor: Actor, tipo: 'ventas' | 'productos' | 'inventario', p: { sedeId: string | null; periodo?: PeriodoReporte; desde?: string; hasta?: string; insumo?: string }) {
      exigirPermiso(actor, 'reportes.ver')
      const rango = resolverPeriodo({ periodo: p.periodo ?? (p.desde || p.hasta ? null : 'este_mes'), desde: p.desde, hasta: p.hasta }, reloj.ahora())
      if (tipo === 'ventas') return casos.ventas(p.sedeId, rango)
      if (tipo === 'productos') return casos.productosMasVendidos(p.sedeId, rango, 15)
      return casos.inventario(p.sedeId, p.insumo ?? null)
    },

    /** Datos del tablero del administrador (hoy, mes, 30 días, top, pedidos activos y alertas). */
    async tablero(actor: Actor) {
      exigirPermiso(actor, 'reportes.ver')
      const ahora = reloj.ahora()
      const hoy = diaBogota(ahora)
      const rangoHoy = resolverPeriodo({ periodo: 'hoy' }, ahora)
      const rangoMes = resolverPeriodo({ periodo: 'este_mes' }, ahora)
      // Mismos días del mes anterior (1..hoy) para una comparación justa.
      const diaDelMes = Number(hoy.slice(8, 10))
      const inicioMesAnt = resolverPeriodo({ periodo: 'mes_pasado' }, ahora)
      const finComparable = sumarDias(inicioMesAnt.diaDesde, Math.min(diaDelMes, Number(inicioMesAnt.diaHasta.slice(8, 10))) - 1)
      const rangoComparable = resolverPeriodo({ desde: inicioMesAnt.diaDesde, hasta: finComparable }, ahora)
      const rango30 = resolverPeriodo({ periodo: 'ultimos_30_dias' }, ahora)

      const [vHoy, vMes, vComparable, v30, top, sedes, porEstado] = await Promise.all([
        casos.ventas(null, rangoHoy),
        casos.ventas(null, rangoMes),
        casos.ventas(null, rangoComparable),
        uow.repos.reportes.ventasPorDia({ sedeId: null, desde: rango30.desde, hasta: rango30.hasta }),
        casos.productosMasVendidos(null, rangoMes, 6),
        uow.repos.sedes.todas(false),
        uow.repos.reportes.pedidosPorEstado({ sedeId: null, desde: new Date(ahora.getTime() - 24 * 3_600_000), hasta: new Date(ahora.getTime() + 60_000) }),
      ])
      const dias = diasEntre(rango30.diaDesde, rango30.diaHasta)
      const alertas: { sedeNombre: string; insumo: string; unidad: 'g' | 'ml' | 'und'; cantidad: number; stockMinimo: number }[] = []
      for (const s of sedes) {
        for (const i of await uow.repos.inventario.deSede(s.id)) {
          if (stockBajo(i.cantidad, i.stockMinimo)) alertas.push({ sedeNombre: s.nombre, insumo: i.insumoNombre, unidad: i.unidad, cantidad: i.cantidad, stockMinimo: i.stockMinimo })
        }
      }
      const activos = Object.fromEntries((['recibido', 'en_preparacion', 'listo', 'en_camino'] as EstadoPedido[]).map((e) => [e, porEstado.find((x) => x.estado === e)?.cantidad ?? 0]))
      return {
        generadoEn: ahora.toISOString(),
        sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre })),
        hoy: { ventas: vHoy.ventas, pedidos: vHoy.pedidos, porSede: vHoy.porSede },
        mes: {
          etiqueta: rangoMes.etiqueta,
          ventas: vMes.ventas,
          pedidos: vMes.pedidos,
          ticketPromedio: vMes.ticketPromedio,
          ventasComparables: vComparable.ventas,
          pedidosComparables: vComparable.pedidos,
          porSede: vMes.porSede,
        },
        serie: {
          dias,
          porSede: sedes.map((s) => ({ sedeId: s.id, sedeNombre: s.nombre, valores: dias.map((dia) => v30.filter((f) => f.dia === dia && f.sedeId === s.id).reduce((a, f) => a + f.ventas, 0)) })),
        },
        topProductos: top.productos,
        activos,
        alertas,
      }
    },
  }
}

export type CasosReportes = ReturnType<typeof crearCasosReportes>

import type { PeriodoReporte, SolicitudReporte, TipoReporte } from '@rejana/shared'
import type { ContextoInterpretacion, InterpreteSolicitudes, ResultadoInterpretacion } from '../../ports/servicios'

// Intérprete sin IA: palabras clave en español colombiano. Sirve sin credenciales y como respaldo
// si el proveedor de IA falla. Solo produce solicitudes del catálogo cerrado.

export const MENSAJE_ACLARACION =
  'No te entendí bien 🤔. Puedo enviarte estos reportes en PDF:\n' +
  '• «Envíame el reporte de ventas de este mes»\n' +
  '• «Ventas de ayer en la sede Villaluz»\n' +
  '• «¿Qué productos se vendieron más la semana pasada?»\n' +
  '• «¿Cuánto inventario de pan hay en la sede de Villaluz?»'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const VACIAS = new Set(['para', 'por', 'con', 'del', 'las', 'los', 'una', 'uno', 'que', 'hay', 'res', 'casa'])

export const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function detectarTipo(t: string): TipoReporte | null {
  if (/(mas vendid|mas pedid|mas se vend|se vendio mas|se vendieron mas|top \d*|productos? estrella|lo que mas|ranking|mejores productos)/.test(t)) return 'productos_mas_vendidos'
  if (/(inventario|stock|existencia|insumo|cuant[oa]s? .*\b(hay|queda|quedan|tenemos)\b|nos queda|queda de)/.test(t)) return 'inventario'
  if (/(venta|vendi|vendimos|facturamos|facturacion|ingreso|recaud|cuanto (se )?(hizo|hicimos|entro))/.test(t)) return 'ventas'
  return null
}

function detectarPeriodo(t: string, hoy: string): { periodo: PeriodoReporte | null; desde: string | null; hasta: string | null } {
  const nada = { desde: null, hasta: null }
  if (/\bhoy\b/.test(t)) return { periodo: 'hoy', ...nada }
  if (/\bayer\b/.test(t)) return { periodo: 'ayer', ...nada }
  if (/semana (pasada|anterior)/.test(t)) return { periodo: 'semana_pasada', ...nada }
  if (/ultim[oa]s? (7|siete) dias|ultima semana/.test(t)) return { periodo: 'ultimos_7_dias', ...nada }
  if (/ultim[oa]s? (30|treinta) dias|ultimo mes/.test(t)) return { periodo: 'ultimos_30_dias', ...nada }
  if (/esta semana|en la semana/.test(t)) return { periodo: 'esta_semana', ...nada }
  if (/mes (pasado|anterior)/.test(t)) return { periodo: 'mes_pasado', ...nada }
  if (/(este mes|del mes|mes actual|en el mes|lo que va del mes)/.test(t)) return { periodo: 'este_mes', ...nada }
  const [anio, mesHoy] = hoy.split('-').map(Number) as [number, number]
  for (const [i, mes] of MESES.entries()) {
    if (new RegExp(`\\b${mes}\\b`).test(t)) {
      const a = i + 1 > mesHoy ? anio - 1 : anio
      const fin = new Date(Date.UTC(a, i + 1, 0)).getUTCDate()
      const mm = String(i + 1).padStart(2, '0')
      const hasta = i + 1 === mesHoy && a === anio ? hoy : `${a}-${mm}-${fin}`
      return { periodo: null, desde: `${a}-${mm}-01`, hasta }
    }
  }
  return { periodo: null, ...nada }
}

function detectarInsumo(t: string, insumos: string[]): string | null {
  const palabrasTexto = new Set(t.split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 3 && !VACIAS.has(p)))
  for (const insumo of insumos) {
    for (const palabra of normalizar(insumo).split(/[^a-z0-9ñ]+/)) {
      if (palabra.length >= 3 && !VACIAS.has(palabra) && palabrasTexto.has(palabra)) return palabra
    }
  }
  return null
}

export function interpretarConReglas(texto: string, ctx: ContextoInterpretacion): ResultadoInterpretacion {
  const t = normalizar(texto)
  const tipo = detectarTipo(t)
  if (!tipo) return { tipo: 'aclaracion', mensaje: MENSAJE_ACLARACION }
  const sede = ctx.sedes.find((s) => t.includes(normalizar(s))) ?? null
  const p = detectarPeriodo(t, ctx.hoy)
  const solicitud: SolicitudReporte = {
    tipo,
    sede,
    periodo: tipo === 'inventario' ? null : (p.periodo ?? (p.desde ? null : 'este_mes')),
    desde: tipo === 'inventario' ? null : p.desde,
    hasta: tipo === 'inventario' ? null : p.hasta,
    insumo: tipo === 'inventario' ? detectarInsumo(t, ctx.insumos) : null,
  }
  return { tipo: 'reporte', solicitud }
}

export const interpretePorReglas: InterpreteSolicitudes = {
  interpretar: async (texto, ctx) => interpretarConReglas(texto, ctx),
}

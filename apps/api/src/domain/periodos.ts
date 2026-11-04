import { diaBogota, type PeriodoReporte } from '@rejana/shared'
import { ErrorDominio } from './errores'

// Colombia no tiene horario de verano: Bogotá es siempre UTC−5.
const OFFSET = '-05:00'
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export interface RangoFechas {
  /** Inicio inclusivo. */
  desde: Date
  /** Fin exclusivo. */
  hasta: Date
  /** Días calendario (AAAA-MM-DD) incluidos, en Bogotá. */
  diaDesde: string
  diaHasta: string
  etiqueta: string
}

export function inicioDia(dia: string): Date {
  return new Date(`${dia}T00:00:00${OFFSET}`)
}

export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function etiquetaDia(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  return `${d} de ${MESES[m - 1]} de ${a}`
}

function rango(diaDesde: string, diaHasta: string, etiqueta?: string): RangoFechas {
  return {
    desde: inicioDia(diaDesde),
    hasta: inicioDia(sumarDias(diaHasta, 1)),
    diaDesde,
    diaHasta,
    etiqueta: etiqueta ?? (diaDesde === diaHasta ? etiquetaDia(diaDesde) : `${etiquetaDia(diaDesde)} – ${etiquetaDia(diaHasta)}`),
  }
}

/** Convierte un periodo con nombre (o fechas explícitas) en un rango en hora de Bogotá. */
export function resolverPeriodo(
  entrada: { periodo?: PeriodoReporte | null; desde?: string | null; hasta?: string | null },
  ahora: Date = new Date(),
): RangoFechas {
  const hoy = diaBogota(ahora)
  if (entrada.desde || entrada.hasta) {
    const desde = entrada.desde ?? entrada.hasta!
    const hasta = entrada.hasta ?? hoy
    if (desde > hasta) throw new ErrorDominio('VALIDACION', 'La fecha inicial no puede ser posterior a la final')
    const dias = (inicioDia(hasta).getTime() - inicioDia(desde).getTime()) / 86_400_000
    if (dias > 400) throw new ErrorDominio('VALIDACION', 'El rango máximo es de 400 días')
    return rango(desde, hasta)
  }
  const [a, m] = hoy.split('-').map(Number) as [number, number]
  const diaSemana = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7 // lunes = 0
  const mesTexto = (anio: number, mes: number) => `${MESES[mes - 1]} de ${anio}`
  switch (entrada.periodo ?? 'hoy') {
    case 'hoy':
      return rango(hoy, hoy, `hoy, ${etiquetaDia(hoy)}`)
    case 'ayer': {
      const ayer = sumarDias(hoy, -1)
      return rango(ayer, ayer, `ayer, ${etiquetaDia(ayer)}`)
    }
    case 'esta_semana':
      return rango(sumarDias(hoy, -diaSemana), hoy, 'esta semana')
    case 'semana_pasada': {
      const lunes = sumarDias(hoy, -diaSemana - 7)
      return rango(lunes, sumarDias(lunes, 6), 'la semana pasada')
    }
    case 'este_mes':
      return rango(`${hoy.slice(0, 8)}01`, hoy, mesTexto(a, m))
    case 'mes_pasado': {
      const mesAnt = m === 1 ? 12 : m - 1
      const anioAnt = m === 1 ? a - 1 : a
      const inicio = `${anioAnt}-${String(mesAnt).padStart(2, '0')}-01`
      const fin = sumarDias(`${hoy.slice(0, 8)}01`, -1)
      return rango(inicio, fin, mesTexto(anioAnt, mesAnt))
    }
    case 'ultimos_7_dias':
      return rango(sumarDias(hoy, -6), hoy, 'los últimos 7 días')
    case 'ultimos_30_dias':
      return rango(sumarDias(hoy, -29), hoy, 'los últimos 30 días')
  }
}

/** Lista de días entre dos fechas (inclusive), para series diarias. */
export function diasEntre(diaDesde: string, diaHasta: string): string[] {
  const out: string[] = []
  for (let d = diaDesde; d <= diaHasta; d = sumarDias(d, 1)) out.push(d)
  return out
}

import type { Unidad } from './enums'

export const ZONA_HORARIA = 'America/Bogota'

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

/** $ 36.000 */
export function cop(valor: number): string {
  // Intl usa un espacio duro entre el símbolo y el número; lo dejamos así para que no se parta.
  return fmtCOP.format(Math.round(valor))
}

const fmtNumero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

export function numero(valor: number): string {
  return fmtNumero.format(valor)
}

/** Muestra una cantidad de insumo en la unidad más legible (1.500 g → 1,5 kg). */
export function cantidadInsumo(valor: number, unidad: Unidad): string {
  if (unidad === 'g' && Math.abs(valor) >= 1000) return `${numero(valor / 1000)} kg`
  if (unidad === 'ml' && Math.abs(valor) >= 1000) return `${numero(valor / 1000)} L`
  if (unidad === 'und') return `${numero(valor)} und`
  return `${numero(valor)} ${unidad}`
}

const fmtHora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit', hour12: true })
const fmtFecha = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, day: 'numeric', month: 'short', year: 'numeric' })
const fmtFechaHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_HORARIA,
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export function hora(fecha: string | number | Date): string {
  return fmtHora.format(new Date(fecha))
}
export function fecha(fecha: string | number | Date): string {
  return fmtFecha.format(new Date(fecha))
}
export function fechaHora(fecha: string | number | Date): string {
  return fmtFechaHora.format(new Date(fecha))
}

/** Fecha calendario (AAAA-MM-DD) en Bogotá. */
export function diaBogota(fecha: string | number | Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(fecha))
}

/** Minutos transcurridos desde una fecha. */
export function minutosDesde(fecha: string | number | Date, ahora: number = Date.now()): number {
  return Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 60_000))
}

/** Normaliza un celular colombiano a E.164 (+573001234567). Devuelve null si no es válido. */
export function telefonoE164(entrada: string): string | null {
  const digitos = entrada.replace(/[^\d+]/g, '')
  const limpio = digitos.startsWith('+') ? digitos.slice(1) : digitos
  if (/^57[3]\d{9}$/.test(limpio)) return `+${limpio}`
  if (/^3\d{9}$/.test(limpio)) return `+57${limpio}`
  // Fijo de Bogotá con indicativo nacional (601 + 7 dígitos)
  if (/^601\d{7}$/.test(limpio)) return `+57${limpio}`
  if (/^57601\d{7}$/.test(limpio)) return `+${limpio}`
  return null
}

/** +573001234567 → 300 123 4567 */
export function telefonoLegible(e164: string): string {
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164
}

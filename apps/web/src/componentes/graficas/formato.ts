/** $ 1,2 M · $ 850 mil · $ 900 (ejes compactos, un solo estilo por eje). */
export function pesosCompactos(v: number): string {
  const n = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })
  if (Math.abs(v) >= 1_000_000) return `$ ${n.format(v / 1_000_000)} M`
  if (Math.abs(v) >= 1_000) return `$ ${n.format(v / 1_000)} mil`
  return `$ ${n.format(v)}`
}

/** Máximo "redondo" y marcas limpias para el eje Y. */
export function escala(maximo: number, marcas = 4): { tope: number; ticks: number[] } {
  if (maximo <= 0) return { tope: 1, ticks: [0] }
  const crudo = maximo / marcas
  const potencia = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo) ?? 10 * potencia
  const tope = Math.ceil(maximo / paso) * paso
  return { tope, ticks: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) }
}

export function fechaCorta(dia: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${dia}T12:00:00Z`)).replace('.', '')
}

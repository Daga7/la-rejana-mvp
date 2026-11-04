// Reglas de los turnos del personal.

/** Un turno de más de 16 horas casi siempre es una salida que no se marcó. */
export const MINUTOS_TURNO_SOSPECHOSO = 16 * 60

export function minutosTrabajados(entrada: Date, salida: Date | null, ahora: Date): number {
  const fin = salida ?? ahora
  return Math.max(0, Math.floor((fin.getTime() - entrada.getTime()) / 60_000))
}

interface TurnoResumible {
  usuarioId: string
  usuarioNombre: string
  rol: string
  sedeNombre: string
  minutos: number
  abierto: boolean
}

/** Totales por persona, ordenados de quien más horas tiene a quien menos. */
export function resumenPorPersona<T extends TurnoResumible>(turnos: T[]) {
  const mapa = new Map<string, { usuarioId: string; usuarioNombre: string; rol: T['rol']; sedeNombre: string; turnos: number; minutos: number; abiertos: number }>()
  for (const t of turnos) {
    const r = mapa.get(t.usuarioId) ?? { usuarioId: t.usuarioId, usuarioNombre: t.usuarioNombre, rol: t.rol, sedeNombre: t.sedeNombre, turnos: 0, minutos: 0, abiertos: 0 }
    r.turnos += 1
    r.minutos += t.minutos
    if (t.abierto) r.abiertos += 1
    mapa.set(t.usuarioId, r)
  }
  return [...mapa.values()].sort((a, b) => b.minutos - a.minutos || a.usuarioNombre.localeCompare(b.usuarioNombre))
}

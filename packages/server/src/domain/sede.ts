import { distanciaKm, type Punto } from '@rejana/shared'

export interface HorarioSede {
  horaApertura: string // HH:MM o HH:MM:SS
  horaCierre: string
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/** ¿La sede está abierta ahora (hora de Bogotá)? Soporta cierres después de medianoche. */
export function estaAbierta(sede: HorarioSede, ahora: Date = new Date()): boolean {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(ahora)
  const actual = minutos(partes)
  const abre = minutos(sede.horaApertura)
  const cierra = minutos(sede.horaCierre)
  if (abre === cierra) return true // 24 horas
  return abre < cierra ? actual >= abre && actual < cierra : actual >= abre || actual < cierra
}

export function dentroDeCobertura(sede: Punto & { radioEntregaKm: number }, destino: Punto): boolean {
  return distanciaKm(sede, destino) <= sede.radioEntregaKm
}

export function slugificar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

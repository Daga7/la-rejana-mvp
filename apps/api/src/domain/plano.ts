import { PLANO_MAX } from '@rejana/shared'
import { ErrorDominio } from './errores'

// Plano de una zona del salón: cuadrícula de casillas donde cada mesa ocupa un rectángulo.

export interface Rectangulo {
  x: number
  y: number
  ancho: number
  alto: number
}

/** Dos mesas chocan si sus rectángulos se superponen (tocarse por un borde está permitido). */
export function chocan(a: Rectangulo, b: Rectangulo): boolean {
  return a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto
}

export function dentroDelPlano(r: Rectangulo): boolean {
  return r.x >= 0 && r.y >= 0 && r.ancho >= 1 && r.alto >= 1 && r.x + r.ancho <= PLANO_MAX && r.y + r.alto <= PLANO_MAX
}

/** Valida que la mesa quepa en el plano y no se monte sobre otra de la misma zona. */
export function validarUbicacion(r: Rectangulo & { numero: number }, otras: (Rectangulo & { numero: number })[]): void {
  if (!dentroDelPlano(r)) throw new ErrorDominio('VALIDACION', `La mesa ${r.numero} se sale del plano`, { campo: 'x' })
  const choque = otras.find((o) => chocan(r, o))
  if (choque) throw new ErrorDominio('VALIDACION', `La mesa ${r.numero} quedaría encima de la mesa ${choque.numero}`, { campo: 'x', mesa: choque.numero })
}

/**
 * Primer lugar libre para una mesa nueva: primero en una retícula ordenada (columnas cada 3 casillas,
 * empezando en 1), y si no hay, en cualquier casilla. Devuelve null si el plano está lleno.
 */
export function primerLugarLibre(tamano: { ancho: number; alto: number }, ocupadas: Rectangulo[]): { x: number; y: number } | null {
  const libre = (x: number, y: number) => {
    const r = { x, y, ...tamano }
    return dentroDelPlano(r) && !ocupadas.some((o) => chocan(r, o))
  }
  for (let y = 1; y < PLANO_MAX; y += 3) for (let x = 1; x < 12; x += 3) if (libre(x, y)) return { x, y }
  for (let y = 0; y < PLANO_MAX; y++) for (let x = 0; x < PLANO_MAX; x++) if (libre(x, y)) return { x, y }
  return null
}

/** Tamaño visible del plano de una zona: lo que ocupan sus mesas más un margen (mínimo 12 × 8 casillas). */
export function tamanoPlano(mesas: Rectangulo[]): { ancho: number; alto: number } {
  const ancho = Math.max(12, ...mesas.map((m) => m.x + m.ancho + 1))
  const alto = Math.max(8, ...mesas.map((m) => m.y + m.alto + 1))
  return { ancho: Math.min(PLANO_MAX, ancho), alto: Math.min(PLANO_MAX, alto) }
}

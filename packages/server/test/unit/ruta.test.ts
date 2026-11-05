import { describe, expect, it } from 'vitest'
import { planificarRuta } from '../../src/domain/ruta'

/** Matriz simétrica a partir de posiciones en una recta (minutos = distancia). */
function matrizLineal(pos: number[]): number[][] {
  return pos.map((a) => pos.map((b) => Math.abs(a - b)))
}

function fuerzaBruta(m: number[][], servicio: number): number {
  const n = m.length - 1
  const idx = Array.from({ length: n }, (_, i) => i + 1)
  let mejor = Infinity
  const permutar = (resto: number[], prev: number, t: number, primero: boolean) => {
    if (resto.length === 0) {
      mejor = Math.min(mejor, t)
      return
    }
    for (const [k, j] of resto.entries()) {
      permutar([...resto.slice(0, k), ...resto.slice(k + 1)], j, t + (primero ? 0 : servicio) + m[prev]![j]!, false)
    }
  }
  permutar(idx, 0, 0, true)
  return mejor
}

describe('optimizador de rutas', () => {
  it('sin entregas no hay salidas', () => {
    expect(planificarRuta([[0]], { limiteMinutos: 25, minutosPorParada: 3 }).salidas).toEqual([])
  })

  it('ordena las entregas en el orden que minimiza el tiempo total', () => {
    // Sede en 0; entregas en 10, 4 y 7 (minutos). El orden óptimo es 4 → 7 → 10.
    const m = matrizLineal([0, 10, 4, 7])
    const plan = planificarRuta(m, { limiteMinutos: 60, minutosPorParada: 2 })
    expect(plan.dividir).toBe(false)
    expect(plan.salidas[0]!.orden).toEqual([2, 3, 1])
    expect(plan.salidas[0]!.llegadas).toEqual([4, 9, 14])
    expect(plan.salidas[0]!.minutosTotales).toBe(14)
  })

  it('coincide con la fuerza bruta en matrices aleatorias', () => {
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let caso = 0; caso < 25; caso++) {
      const n = 2 + (caso % 6)
      const pts = Array.from({ length: n + 1 }, () => ({ x: rnd() * 10, y: rnd() * 10 }))
      const m = pts.map((a) => pts.map((b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10))
      const plan = planificarRuta(m, { limiteMinutos: 1000, minutosPorParada: 1.5 })
      expect(plan.salidas).toHaveLength(1)
      expect(plan.salidas[0]!.minutosTotales).toBeCloseTo(fuerzaBruta(m, 1.5), 1)
    }
  })

  it('divide en dos salidas cuando una sola supera el límite (comida caliente)', () => {
    // Dos entregas al este (10 y 12) y dos al oeste (-10 y -12): juntas no caben en 25 minutos.
    const pos = [0, 10, 12, -10, -12]
    const m = matrizLineal(pos)
    const plan = planificarRuta(m, { limiteMinutos: 25, minutosPorParada: 2 })
    expect(plan.dividir).toBe(true)
    expect(plan.salidas).toHaveLength(2)
    for (const salida of plan.salidas) {
      expect(salida.cumpleLimite).toBe(true)
      const lados = salida.orden.map((i) => Math.sign(pos[i]!))
      expect(new Set(lados).size).toBe(1) // cada salida va hacia un solo lado
    }
    expect(plan.inalcanzables).toEqual([])
  })

  it('marca la entrega que ni sola alcanza el límite', () => {
    const m = matrizLineal([0, 5, 40])
    const plan = planificarRuta(m, { limiteMinutos: 25, minutosPorParada: 2 })
    expect(plan.inalcanzables).toEqual([2])
    const ultima = plan.salidas.at(-1)!
    expect(ultima.orden).toEqual([2])
    expect(ultima.cumpleLimite).toBe(false)
    expect(plan.salidas[0]!.cumpleLimite).toBe(true)
  })

  it('las llegadas crecen a lo largo de la ruta', () => {
    const m = matrizLineal([0, 3, 9, 6, 1, 12])
    const plan = planificarRuta(m, { limiteMinutos: 90, minutosPorParada: 3 })
    const ll = plan.salidas[0]!.llegadas
    expect([...ll].sort((a, b) => a - b)).toEqual(ll)
  })
})

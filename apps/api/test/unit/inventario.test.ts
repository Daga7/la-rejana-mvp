import { describe, expect, it } from 'vitest'
import { consumoPorReceta, faltantes, productosAfectados, stockBajo, unidadesPreparables } from '../../src/domain/inventario'

const recetas = new Map([
  ['hamburguesa', [{ insumoId: 'pan', cantidad: 1 }, { insumoId: 'carne', cantidad: 150 }, { insumoId: 'queso', cantidad: 1 }]],
  ['doble', [{ insumoId: 'pan', cantidad: 1 }, { insumoId: 'carne', cantidad: 300 }, { insumoId: 'queso', cantidad: 2 }]],
  ['parchada', [{ insumoId: 'pan', cantidad: 1 }, { insumoId: 'maduro', cantidad: 0.5 }]],
  ['jugo', [{ insumoId: 'fruta', cantidad: 250 }]],
])

describe('inventario por receta', () => {
  it('suma el consumo de todos los productos y cantidades del pedido', () => {
    const c = consumoPorReceta(
      [
        { productoId: 'hamburguesa', cantidad: 2 },
        { productoId: 'doble', cantidad: 1 },
      ],
      recetas,
    )
    expect(Object.fromEntries(c)).toEqual({ pan: 3, carne: 600, queso: 4 })
  })

  it('32 panes alcanzan para 32 hamburguesas si lo demás sobra', () => {
    const stock = new Map([['pan', 32], ['carne', 50_000], ['queso', 500]])
    expect(unidadesPreparables(recetas.get('hamburguesa')!, stock)).toBe(32)
  })

  it('manda el insumo más escaso', () => {
    const stock = new Map([['pan', 32], ['carne', 1000], ['queso', 500]])
    expect(unidadesPreparables(recetas.get('hamburguesa')!, stock)).toBe(6) // 1000 g / 150 g
  })

  it('X kg de fruta → N jugos (cantidades en gramos)', () => {
    expect(unidadesPreparables(recetas.get('jugo')!, new Map([['fruta', 3000]]))).toBe(12)
  })

  it('soporta cantidades fraccionarias (medio maduro por hamburguesa)', () => {
    expect(unidadesPreparables(recetas.get('parchada')!, new Map([['pan', 100], ['maduro', 12]]))).toBe(24)
  })

  it('sin un insumo, el producto queda agotado (0 unidades)', () => {
    expect(unidadesPreparables(recetas.get('parchada')!, new Map([['pan', 100]]))).toBe(0)
  })

  it('un producto sin receta no está limitado por inventario', () => {
    expect(unidadesPreparables([], new Map())).toBeNull()
  })

  it('detecta faltantes y qué productos los causan', () => {
    const items = [
      { productoId: 'hamburguesa', cantidad: 3 },
      { productoId: 'jugo', cantidad: 1 },
    ]
    const consumo = consumoPorReceta(items, recetas)
    const f = faltantes(consumo, new Map([['pan', 2], ['carne', 1000], ['queso', 10], ['fruta', 1000]]))
    expect(f).toEqual([{ insumoId: 'pan', requerido: 3, disponible: 2 }])
    expect(productosAfectados(items, recetas, new Set(f.map((x) => x.insumoId)))).toEqual(['hamburguesa'])
  })

  it('alerta de stock bajo solo cuando hay mínimo configurado', () => {
    expect(stockBajo(5, 10)).toBe(true)
    expect(stockBajo(10, 10)).toBe(true)
    expect(stockBajo(11, 10)).toBe(false)
    expect(stockBajo(0, 0)).toBe(false)
  })
})

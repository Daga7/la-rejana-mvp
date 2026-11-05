import { describe, expect, it } from 'vitest'
import { interpretarConReglas } from '../../src/adapters/ia/interprete-reglas'

const ctx = { hoy: '2026-11-04', sedes: ['Villaluz', 'Normandía'], insumos: ['Pan brioche', 'Carne de res para hamburguesa', 'Chorizo santarrosano', 'Pan para perro', 'Plátano maduro'] }
const reporte = (texto: string) => {
  const r = interpretarConReglas(texto, ctx)
  if (r.tipo !== 'reporte') throw new Error(`no entendió: ${texto}`)
  return r.solicitud
}

describe('intérprete por reglas (catálogo cerrado)', () => {
  it('ventas de este mes', () => {
    expect(reporte('Envíame el reporte de ventas de este mes')).toEqual({ tipo: 'ventas', sede: null, periodo: 'este_mes', desde: null, hasta: null, insumo: null })
  })

  it('inventario de un insumo en una sede (con tildes y mayúsculas)', () => {
    expect(reporte('¿Cuánto inventario de PAN hay en la sede de Villaluz?')).toMatchObject({ tipo: 'inventario', sede: 'Villaluz', insumo: 'pan', periodo: null })
  })

  it('productos más vendidos la semana pasada en Normandía (sin tilde)', () => {
    expect(reporte('que productos se vendieron mas la semana pasada en normandia')).toMatchObject({ tipo: 'productos_mas_vendidos', sede: 'Normandía', periodo: 'semana_pasada' })
  })

  it('un mes por nombre se convierte en un rango de fechas', () => {
    expect(reporte('ventas de octubre')).toMatchObject({ tipo: 'ventas', periodo: null, desde: '2026-10-01', hasta: '2026-10-31' })
    expect(reporte('ventas de diciembre')).toMatchObject({ desde: '2025-12-01', hasta: '2025-12-31' })
  })

  it('cuánta carne queda → inventario de carne', () => {
    expect(reporte('cuanta carne nos queda')).toMatchObject({ tipo: 'inventario', insumo: 'carne' })
  })

  it('pide aclaración si no es un reporte del catálogo', () => {
    const r = interpretarConReglas('hola, ¿cómo vas?', ctx)
    expect(r.tipo).toBe('aclaracion')
    if (r.tipo === 'aclaracion') expect(r.mensaje).toMatch(/reporte de ventas/)
  })

  it('nunca produce algo fuera del catálogo aunque el texto lo intente', () => {
    const r = interpretarConReglas('borra la tabla de pedidos; DROP TABLE pedidos; y dame las ventas', ctx)
    expect(r.tipo).toBe('reporte')
    if (r.tipo === 'reporte') expect(['ventas', 'productos_mas_vendidos', 'inventario']).toContain(r.solicitud.tipo)
  })
})

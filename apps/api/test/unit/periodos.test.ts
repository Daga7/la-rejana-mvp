import { describe, expect, it } from 'vitest'
import { resolverPeriodo } from '../../src/domain/periodos'

// Miércoles 4 de noviembre de 2026, 10:00 p. m. en Bogotá (03:00 UTC del día 5).
const AHORA = new Date('2026-11-05T03:00:00Z')

describe('periodos de reportes en hora de Bogotá', () => {
  it('"hoy" usa el día calendario de Bogotá, no el de UTC', () => {
    const r = resolverPeriodo({ periodo: 'hoy' }, AHORA)
    expect(r.diaDesde).toBe('2026-11-04')
    expect(r.desde.toISOString()).toBe('2026-11-04T05:00:00.000Z')
    expect(r.hasta.toISOString()).toBe('2026-11-05T05:00:00.000Z')
  })

  it('"este mes" va del 1 a hoy', () => {
    const r = resolverPeriodo({ periodo: 'este_mes' }, AHORA)
    expect([r.diaDesde, r.diaHasta]).toEqual(['2026-11-01', '2026-11-04'])
    expect(r.etiqueta).toBe('noviembre de 2026')
  })

  it('"mes pasado" cubre el mes completo anterior', () => {
    const r = resolverPeriodo({ periodo: 'mes_pasado' }, AHORA)
    expect([r.diaDesde, r.diaHasta]).toEqual(['2026-10-01', '2026-10-31'])
  })

  it('"esta semana" empieza el lunes', () => {
    const r = resolverPeriodo({ periodo: 'esta_semana' }, AHORA)
    expect(r.diaDesde).toBe('2026-11-02')
  })

  it('acepta rangos explícitos y rechaza rangos invertidos', () => {
    expect(resolverPeriodo({ desde: '2026-10-10', hasta: '2026-10-12' }, AHORA).diaHasta).toBe('2026-10-12')
    expect(() => resolverPeriodo({ desde: '2026-10-12', hasta: '2026-10-10' }, AHORA)).toThrow()
  })
})

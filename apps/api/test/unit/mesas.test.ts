import { describe, expect, it } from 'vitest'
import { estadoDeMesa, rondasSinServir, subtotalCuenta, validarCobroMesa, validarTransicion } from '../../src/domain/pedido'
import { permisoTransicion, transicionesPosibles, type Actor } from '../../src/domain/permisos'

const actor = (rol: 'mesero' | 'cocina' | 'caja' | 'admin' | 'domiciliario'): Actor => ({ tipo: 'usuario', id: 'u1', rol, sedeId: 's1', sesionId: 'x' })

describe('transiciones de una ronda de mesa', () => {
  it('la cocina prepara, el mesero sirve y no existe "en camino"', () => {
    expect(transicionesPosibles('listo', 'mesa').sort()).toEqual(['cancelado', 'entregado'])
    expect(permisoTransicion('listo', 'en_camino', 'mesa')).toBeNull()
    expect(permisoTransicion('listo', 'entregado', 'mesa')).toBe('mesas.servir')
    expect(() => validarTransicion(actor('mesero'), 'listo', 'entregado', 'mesa')).not.toThrow()
    expect(() => validarTransicion(actor('cocina'), 'listo', 'entregado', 'mesa')).toThrow(/rol/)
    expect(() => validarTransicion(actor('mesero'), 'recibido', 'en_preparacion', 'mesa')).toThrow(/rol/)
    expect(() => validarTransicion(actor('cocina'), 'recibido', 'en_preparacion', 'mesa')).not.toThrow()
  })

  it('el mesero no toca los domicilios', () => {
    for (const [desde, hacia] of [['recibido', 'en_preparacion'], ['listo', 'en_camino'], ['en_camino', 'entregado']] as const) {
      expect(() => validarTransicion(actor('mesero'), desde, hacia, 'domicilio')).toThrow()
    }
  })
})

describe('cuenta de la mesa', () => {
  const rondas = [
    { estado: 'entregado' as const, total: 50000 },
    { estado: 'cancelado' as const, total: 20000 },
    { estado: 'listo' as const, total: 15000 },
  ]

  it('suma solo lo que no se canceló y cuenta lo que falta por servir', () => {
    expect(subtotalCuenta(rondas)).toBe(65000)
    expect(rondasSinServir(rondas)).toBe(1)
  })

  it('pinta la mesa según su cuenta', () => {
    expect(estadoDeMesa(null, [])).toBe('libre')
    expect(estadoDeMesa({ cuentaPedidaEn: null }, [{ estado: 'en_preparacion', total: 1 }])).toBe('ocupada')
    expect(estadoDeMesa({ cuentaPedidaEn: null }, rondas)).toBe('para_servir')
    expect(estadoDeMesa({ cuentaPedidaEn: new Date() }, rondas)).toBe('por_cobrar')
  })

  it('el cobro dividido debe sumar consumo más propina y calcula el cambio del efectivo', () => {
    const pagos = validarCobroMesa(
      [
        { metodo: 'qr', monto: 40000 },
        { metodo: 'efectivo', monto: 31500, recibido: 50000 },
      ],
      65000,
      6500,
    )
    expect(pagos[1]).toMatchObject({ recibido: 50000, cambio: 18500 })
    expect(pagos[0]).toMatchObject({ recibido: null, cambio: null })
    expect(() => validarCobroMesa([{ metodo: 'efectivo', monto: 65000 }], 65000, 6500)).toThrow(/suman/)
    expect(() => validarCobroMesa([{ metodo: 'efectivo', monto: 65000, recibido: 60000 }], 65000, 0)).toThrow(/no alcanza/)
    expect(() => validarCobroMesa([{ metodo: 'efectivo', monto: 1 }], 0, 0)).toThrow(/cero/)
    expect(() => validarCobroMesa([{ metodo: 'efectivo', monto: 140000 }], 65000, 75000)).toThrow(/propina/)
  })
})

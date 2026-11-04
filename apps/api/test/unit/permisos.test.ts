import { describe, expect, it } from 'vitest'
import type { Rol } from '@rejana/shared'
import { validarTransicion } from '../../src/domain/pedido'
import { exigirSede, puedeOperarSede, tienePermiso, type Actor } from '../../src/domain/permisos'

const actor = (rol: Rol, sedeId: string | null = 'sede-a'): Actor => ({ tipo: 'usuario', id: `u-${rol}`, rol, sedeId, sesionId: 's' })

describe('permisos por rol', () => {
  it('solo el admin gestiona menú, inventario, empleados y lee el buzón', () => {
    for (const rol of ['cliente', 'mesero', 'cocina', 'caja', 'domiciliario'] as Rol[]) {
      expect(tienePermiso(actor(rol), 'menu.gestionar')).toBe(false)
      expect(tienePermiso(actor(rol), 'inventario.gestionar')).toBe(false)
      expect(tienePermiso(actor(rol), 'empleados.gestionar')).toBe(false)
      expect(tienePermiso(actor(rol), 'buzon.leer')).toBe(false)
    }
    expect(tienePermiso(actor('admin', null), 'menu.gestionar')).toBe(true)
    expect(tienePermiso(actor('admin', null), 'buzon.leer')).toBe(true)
  })

  it('todos los empleados pueden escribir al buzón; los clientes no', () => {
    for (const rol of ['mesero', 'cocina', 'caja', 'domiciliario', 'admin'] as Rol[]) expect(tienePermiso(actor(rol), 'buzon.enviar')).toBe(true)
    expect(tienePermiso(actor('cliente', null), 'buzon.enviar')).toBe(false)
  })

  it('un invitado no tiene permisos de operación', () => {
    expect(tienePermiso({ tipo: 'invitado' }, 'pedidos.ver_sede')).toBe(false)
  })
})

describe('alcance por sede', () => {
  it('un empleado solo opera su sede; el admin todas', () => {
    expect(puedeOperarSede(actor('cocina', 'sede-a'), 'sede-a')).toBe(true)
    expect(puedeOperarSede(actor('cocina', 'sede-a'), 'sede-b')).toBe(false)
    expect(() => exigirSede(actor('caja', 'sede-a'), 'sede-b')).toThrow(/tu sede/)
    expect(puedeOperarSede(actor('admin', null), 'sede-b')).toBe(true)
  })

  it('un cliente nunca opera una sede', () => {
    expect(puedeOperarSede(actor('cliente', null), 'sede-a')).toBe(false)
  })
})

describe('máquina de estados del pedido', () => {
  it('cocina mueve recibido → en preparación → listo', () => {
    expect(() => validarTransicion(actor('cocina'), 'recibido', 'en_preparacion')).not.toThrow()
    expect(() => validarTransicion(actor('cocina'), 'en_preparacion', 'listo')).not.toThrow()
  })

  it('cocina no despacha ni cancela', () => {
    expect(() => validarTransicion(actor('cocina'), 'listo', 'en_camino')).toThrow()
    expect(() => validarTransicion(actor('cocina'), 'recibido', 'cancelado')).toThrow()
  })

  it('no se puede saltar estados ni revivir un pedido', () => {
    expect(() => validarTransicion(actor('admin', null), 'recibido', 'entregado')).toThrow(/no puede pasar/)
    expect(() => validarTransicion(actor('admin', null), 'cancelado', 'recibido')).toThrow()
    expect(() => validarTransicion(actor('admin', null), 'entregado', 'cancelado')).toThrow()
  })

  it('el domiciliario solo marca entregado', () => {
    expect(() => validarTransicion(actor('domiciliario'), 'en_camino', 'entregado')).not.toThrow()
    expect(() => validarTransicion(actor('domiciliario'), 'recibido', 'en_preparacion')).toThrow()
  })
})

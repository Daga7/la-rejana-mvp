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

import { estaAbierta, dentroDeCobertura } from '../../src/domain/sede'

describe('reglas de sede', () => {
  // 2026-11-04 15:00 en Bogotá = 20:00 UTC
  const tarde = new Date('2026-11-04T20:00:00Z')
  const madrugada = new Date('2026-11-04T08:00:00Z') // 3:00 a. m. en Bogotá

  it('abre y cierra según la hora de Bogotá', () => {
    expect(estaAbierta({ horaApertura: '12:00', horaCierre: '22:30' }, tarde)).toBe(true)
    expect(estaAbierta({ horaApertura: '12:00', horaCierre: '22:30' }, madrugada)).toBe(false)
  })

  it('soporta horarios que pasan la medianoche', () => {
    expect(estaAbierta({ horaApertura: '18:00', horaCierre: '03:30' }, madrugada)).toBe(true)
    expect(estaAbierta({ horaApertura: '18:00', horaCierre: '03:30' }, tarde)).toBe(false)
  })

  it('cobertura por radio en km', () => {
    const sede = { lat: 4.68862, lng: -74.10945, radioEntregaKm: 5 }
    expect(dentroDeCobertura(sede, { lat: 4.7, lng: -74.1 })).toBe(true)
    expect(dentroDeCobertura(sede, { lat: 4.6, lng: -74.05 })).toBe(false)
  })
})

import { hasherBcrypt } from '../../src/adapters/seguridad/hasher-bcrypt'

describe('hash de contraseñas', () => {
  const h = hasherBcrypt(4, 'pimienta-de-prueba-suficientemente-larga-123')

  it('distingue contraseñas largas que solo difieren después de 72 bytes', async () => {
    const base = 'mi frase secreta con tildes áéíóú y eñes ñandú '.repeat(2)
    const hash = await h.hash(`${base}A`)
    expect(await h.verificar(`${base}A`, hash)).toBe(true)
    expect(await h.verificar(`${base}B`, hash)).toBe(false)
  })

  it('acepta hashes antiguos y pide actualizarlos', async () => {
    const bcrypt = (await import('bcryptjs')).default
    const viejo = await bcrypt.hash('clave antigua 2026', 4)
    expect(await h.verificar('clave antigua 2026', viejo)).toBe(true)
    expect(h.necesitaActualizar(viejo)).toBe(true)
    expect(h.necesitaActualizar(await h.hash('otra'))).toBe(false)
  })

  it('exige costo ≥ 12 en producción', () => {
    const antes = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    expect(() => hasherBcrypt(10, 'x')).toThrow()
    process.env.NODE_ENV = antes
  })
})

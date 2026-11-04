import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsSeed, levantar, Navegador, type Entorno } from '../ayudas'

let e: Entorno
let ids: Awaited<ReturnType<typeof idsSeed>>
let admin: Navegador

beforeAll(async () => {
  e = await levantar()
  ids = await idsSeed(e.c)
  admin = new Navegador(e.app)
  await admin.ingresar('admin@larejana.test')
})
afterAll(async () => {
  await e.cerrar()
})

describe('tablero y reportes (catálogo cerrado)', () => {
  it('solo el admin ve el tablero', async () => {
    const caja = new Navegador(e.app)
    await caja.ingresar('caja.villaluz@larejana.test')
    expect((await caja.get('/api/admin/tablero')).statusCode).toBe(403)
    const r = await admin.get('/api/admin/tablero')
    expect(r.statusCode).toBe(200)
    const t = r.json()
    expect(t.serie.dias).toHaveLength(30)
    expect(t.serie.porSede).toHaveLength(2)
    expect(t.activos).toHaveProperty('recibido')
    expect(Array.isArray(t.alertas)).toBe(true)
  })

  it('las ventas del reporte cuadran con los pedidos no cancelados de la BD', async () => {
    const r = (await admin.get('/api/admin/reportes/ventas?periodo=ultimos_7_dias&sedeId=todas')).json()
    const sumaDias = r.porDia.reduce((s: number, d: { ventas: number }) => s + d.ventas, 0)
    expect(sumaDias).toBe(r.ventas)
    const sumaSedes = r.porSede.reduce((s: number, d: { ventas: number }) => s + d.ventas, 0)
    expect(sumaSedes).toBe(r.ventas)
    const [fila] = (
      await e.c.conexion.db.execute<{ total: string }>(
        sql`select coalesce(sum(total),0)::text as total from pedidos where estado <> 'cancelado' and creado_en >= ${new Date(r.rango.desde)} and creado_en < ${new Date(r.rango.hasta)}`,
      )
    ).rows
    expect(r.ventas).toBe(Number(fila!.total))
    expect(r.ticketPromedio).toBe(r.pedidos ? Math.round(r.ventas / r.pedidos) : 0)
  })

  it('productos más vendidos ordenados por unidades y filtrables por sede', async () => {
    const r = (await admin.get(`/api/admin/reportes/productos?periodo=este_mes&sedeId=${ids.normandia}`)).json()
    expect(r.sedeNombre).toBe('Normandía')
    const unidades = r.productos.map((p: { unidades: number }) => p.unidades)
    expect([...unidades].sort((a: number, b: number) => b - a)).toEqual(unidades)
    expect(r.productos.some((p: { nombre: string }) => p.nombre === 'Choriperro Ranchero')).toBe(false) // no se vende en Normandía
  })

  it('inventario filtrado por insumo sin importar tildes ni mayúsculas', async () => {
    const r = (await admin.get('/api/admin/reportes/inventario?insumo=PAN')).json()
    const nombres = [...new Set(r.filas.map((f: { insumo: string }) => f.insumo))].sort()
    expect(nombres).toEqual(['Pan brioche', 'Pan para perro'])
    expect(new Set(r.filas.map((f: { sedeNombre: string }) => f.sedeNombre)).size).toBe(2)
    const platano = (await admin.get(`/api/admin/reportes/inventario?insumo=platano&sedeId=${ids.normandia}`)).json()
    expect(platano.filas).toEqual([expect.objectContaining({ insumo: 'Plátano maduro', sedeNombre: 'Normandía', bajo: true })])
  })

  it('un empleado no consulta reportes', async () => {
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    expect((await cocina.get('/api/admin/reportes/ventas')).statusCode).toBe(403)
  })
})

describe('administración de empleados', () => {
  it('cambiar el rol cierra las sesiones del empleado y queda en auditoría', async () => {
    const mesero = new Navegador(e.app)
    const { id } = await mesero.ingresar('mesero.villaluz@larejana.test')
    const r = await admin.patch(`/api/admin/empleados/${id}`, { rol: 'caja', sedeId: ids.villaluz })
    expect(r.statusCode).toBe(200)
    expect(r.json().empleado).toMatchObject({ rol: 'caja', sesionesCerradas: true })
    expect((await mesero.get('/api/auth/yo')).statusCode).toBe(401)
    const nueva = new Navegador(e.app)
    expect((await nueva.ingresar('mesero.villaluz@larejana.test')).rol).toBe('caja')
    const [reg] = (await admin.get('/api/admin/auditoria?entidad=usuario')).json().registros
    expect(reg).toMatchObject({ accion: 'empleado.actualizar', entidadId: id })
    await admin.patch(`/api/admin/empleados/${id}`, { rol: 'mesero', sedeId: ids.villaluz })
  })

  it('desactivar a un empleado le impide entrar', async () => {
    const lista = (await admin.get('/api/admin/empleados')).json().empleados
    const domi = lista.find((x: { correo: string }) => x.correo === 'domi2.villaluz@larejana.test')
    expect((await admin.patch(`/api/admin/empleados/${domi.id}`, { activo: false })).statusCode).toBe(200)
    expect((await new Navegador(e.app).post('/api/auth/ingresar', { correo: 'domi2.villaluz@larejana.test', clave: 'Rejana2026*' })).statusCode).toBe(403)
    await admin.patch(`/api/admin/empleados/${domi.id}`, { activo: true })
  })

  it('el admin no puede desactivarse a sí mismo y WhatsApp solo aplica a admins con celular', async () => {
    const yo = (await admin.get('/api/auth/yo')).json().usuario
    expect((await admin.patch(`/api/admin/empleados/${yo.id}`, { activo: false })).statusCode).toBe(422)
    const lista = (await admin.get('/api/admin/empleados')).json().empleados
    const cocina = lista.find((x: { rol: string }) => x.rol === 'cocina')
    expect((await admin.patch(`/api/admin/empleados/${cocina.id}`, { whatsappHabilitado: true })).statusCode).toBe(422)
  })

  it('solo el admin gestiona empleados y ve la auditoría', async () => {
    const caja = new Navegador(e.app)
    await caja.ingresar('caja.villaluz@larejana.test')
    expect((await caja.get('/api/admin/empleados')).statusCode).toBe(403)
    expect((await caja.get('/api/admin/auditoria')).statusCode).toBe(403)
  })
})

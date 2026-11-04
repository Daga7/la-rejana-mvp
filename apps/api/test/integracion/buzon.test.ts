import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { levantar, Navegador, type Entorno } from '../ayudas'

let e: Entorno
beforeAll(async () => {
  e = await levantar()
})
afterAll(async () => {
  await e.cerrar()
})

const filas = async (texto: string) =>
  (await e.c.conexion.db.execute<Record<string, unknown>>(sql`select * from buzon_mensajes where mensaje = ${texto}`)).rows

describe('buzón de quejas y sugerencias', () => {
  it('un mensaje anónimo no deja NINGÚN dato del autor en la base de datos', async () => {
    const cocina = new Navegador(e.app)
    const { id } = await cocina.ingresar('cocina.villaluz@larejana.test')
    const texto = `La campana de extracción hace mucho ruido ${Date.now()}`
    const r = await cocina.post('/api/buzon', { tipo: 'queja', mensaje: texto, anonimo: true })
    expect(r.statusCode).toBe(202)
    expect(r.json()).not.toHaveProperty('id')

    const [fila] = await filas(texto)
    expect(fila).toMatchObject({ anonimo: true, autor_id: null, sede_id: null })
    expect(String(fila!.fecha)).toMatch(/^\d{4}-\d{2}-\d{2}$/) // solo la fecha, sin hora
    expect(Object.keys(fila!).sort()).toEqual(['actualizado_en', 'anonimo', 'autor_id', 'estado', 'fecha', 'id', 'mensaje', 'sede_id', 'tipo'])
    expect(fila!.actualizado_en).toBeNull()
    // Nada en la auditoría que lo relacione con quien lo envió
    const auditoria = (await e.c.conexion.db.execute<{ n: number }>(sql`select count(*)::int as n from auditoria where actor_id = ${id} and (entidad = 'buzon' or datos::text ilike ${'%campana%'})`)).rows[0]!
    expect(auditoria.n).toBe(0)
  })

  it('la base de datos rechaza un mensaje marcado anónimo con autor (CHECK)', async () => {
    const u = (await e.c.uow.repos.usuarios.porEmail('cocina.villaluz@larejana.test'))!
    await expect(
      e.c.uow.repos.buzon.crear({ tipo: 'queja', mensaje: 'intento de saltarse la regla', anonimo: true, autorId: u.id, sedeId: null, fecha: '2026-11-04' }),
    ).rejects.toThrow()
  })

  it('un mensaje firmado guarda autor y sede', async () => {
    const caja = new Navegador(e.app)
    await caja.ingresar('caja.normandia@larejana.test')
    const texto = `Propongo un turno extra los viernes ${Date.now()}`
    await caja.post('/api/buzon', { tipo: 'sugerencia', mensaje: texto, anonimo: false })
    const [fila] = await filas(texto)
    expect(fila!.autor_id).not.toBeNull()
    expect(fila!.sede_id).not.toBeNull()
  })

  it('solo el admin lee el buzón y cambia el estado', async () => {
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    expect((await cocina.get('/api/admin/buzon')).statusCode).toBe(403)

    const admin = new Navegador(e.app)
    await admin.ingresar('admin@larejana.test')
    const lista = (await admin.get('/api/admin/buzon')).json().mensajes as { id: string; anonimo: boolean; autorNombre: string | null; sedeNombre: string | null; estado: string }[]
    const anonimo = lista.find((m) => m.anonimo)!
    expect(anonimo).toMatchObject({ autorNombre: null, sedeNombre: null, estado: 'nueva' })
    expect(lista.find((m) => !m.anonimo)!.autorNombre).toBe('Camilo Rojas')
    expect((await admin.patch(`/api/admin/buzon/${anonimo.id}`, { estado: 'en_revision' })).statusCode).toBe(204)
    expect((await admin.get('/api/admin/buzon?estado=en_revision')).json().mensajes.map((m: { id: string }) => m.id)).toContain(anonimo.id)
  })

  it('los clientes no usan el buzón del equipo', async () => {
    const cliente = new Navegador(e.app)
    await cliente.ingresar('cliente@larejana.test')
    expect((await cliente.post('/api/buzon', { tipo: 'queja', mensaje: 'Esto es una queja de cliente', anonimo: true })).statusCode).toBe(403)
    expect((await new Navegador(e.app).post('/api/buzon', { tipo: 'queja', mensaje: 'Sin sesión no se puede', anonimo: true })).statusCode).toBe(401)
  })
})

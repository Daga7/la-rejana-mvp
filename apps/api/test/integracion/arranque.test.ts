import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sembrar } from '../../src/adapters/db/seed'
import { tareasDeArranque } from '../../src/arranque'
import { levantar, limpiar, type Entorno } from '../ayudas'

// Lo que se configura desde el panel de Railway sin consola: datos de prueba al arrancar (solo con la base
// vacía) y la invitación del primer administrador.

let e: Entorno
beforeAll(async () => {
  e = await levantar({ sembrar: false })
})
afterAll(async () => {
  await e.cerrar()
})
beforeEach(async () => {
  await limpiar(e.c)
  e.correos.length = 0
})

const HORA = 3_600_000
const semilla = (soloSiVacia = true) => sembrar(e.c.conexion.db, { pimienta: e.c.env.TOKENS_PEPPER, historicoDias: 1, silencioso: true, costoHash: 4, datosDemo: false, soloSiVacia })
const contar = async (tabla: string) => (await e.c.conexion.db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${tabla}`))).rows[0]!.n

describe('datos de prueba al arrancar', () => {
  it('siembra una base vacía y no vuelve a tocarla', async () => {
    expect(await semilla()).toBe(true)
    const usuarios = await contar('usuarios')
    expect(usuarios).toBeGreaterThan(5)
    expect(await semilla()).toBe(false)
    expect(await contar('usuarios')).toBe(usuarios)
  })

  it('no siembra si ya hay un usuario real aunque no haya sedes', async () => {
    await e.c.uow.repos.usuarios.crear({ email: 'cliente.real@ejemplo.co', nombre: 'Cliente Real', rol: 'cliente', emailVerificadoEn: new Date() })
    expect(await semilla()).toBe(false)
    expect(await contar('sedes')).toBe(0)
  })

  it('dos arranques a la vez siembran una sola vez', async () => {
    const r = await Promise.all([semilla(), semilla()])
    expect(r.filter(Boolean)).toHaveLength(1)
    expect(await contar('sedes')).toBe(2)
  })
})

describe('primer administrador sin consola (ADMIN_INICIAL_CORREO)', () => {
  it('envía una invitación de 2 horas solo si no hay administrador, sin repetirla al reiniciar', async () => {
    expect(await e.c.casos.auth.invitarAdminInicial('Dueno@LaRejana.co')).toBe('enviada')
    expect(e.correos).toHaveLength(1)
    const m = e.correos[0]!
    expect(m.para).toBe('dueno@larejana.co')
    expect(m.texto).toContain('vence en 2 horas')
    const token = /#t=([\w-]+)/.exec(m.texto)?.[1]
    expect(token).toBeTruthy()

    // Reiniciar la API mientras la invitación sigue vigente no manda otro correo.
    expect(await e.c.casos.auth.invitarAdminInicial('dueno@larejana.co')).toBe('vigente')
    expect(e.correos).toHaveLength(1)

    // Pasadas 2 horas el enlace ya no sirve y el siguiente arranque envía uno nuevo.
    await expect(e.c.casos.auth.consultarInvitacion(token!)).resolves.toMatchObject({ correo: 'dueno@larejana.co', rol: 'admin' })
    e.reloj.avanzar(2 * HORA + 1000)
    await expect(e.c.casos.auth.consultarInvitacion(token!)).rejects.toThrow(/venció/)
    expect(await e.c.casos.auth.invitarAdminInicial('dueno@larejana.co')).toBe('enviada')
    expect(e.correos).toHaveLength(2)
    e.reloj.t = Date.now()
  })

  it('el enlace crea el administrador y después la variable ya no hace nada', async () => {
    await e.c.casos.auth.invitarAdminInicial('dueno@larejana.co')
    const token = /#t=([\w-]+)/.exec(e.correos[0]!.texto)![1]!
    const s = await e.c.casos.auth.aceptarInvitacion(token, { nombre: 'Dueño Rejana', clave: 'una frase larga y segura de verdad' }, { ip: '127.0.0.1', userAgent: null })
    expect(s.usuario.rol).toBe('admin')
    await expect(e.c.casos.auth.aceptarInvitacion(token, { nombre: 'Otra Vez', clave: 'una frase larga y segura de verdad' }, { ip: '127.0.0.1', userAgent: null })).rejects.toThrow()
    expect(await e.c.casos.auth.invitarAdminInicial('otro@larejana.co')).toBe('hay_admin')
    expect(e.correos).toHaveLength(1)
  })

  it('no invita a un correo que ya es de un cliente', async () => {
    await semilla()
    await e.c.conexion.db.execute(sql`update usuarios set activo = false where rol = 'admin'`)
    expect(await e.c.casos.auth.invitarAdminInicial('cliente@larejana.test')).toBe('correo_en_uso')
    expect(e.correos).toHaveLength(0)
  })

  it('las tareas de arranque nunca tumban la API', async () => {
    await expect(tareasDeArranque(e.c, { ...e.c.env, ADMIN_INICIAL_CORREO: 'dueno@larejana.co' })).resolves.toBeUndefined()
    expect(e.correos).toHaveLength(1)
    const roto = { ...e.c, casos: { ...e.c.casos, auth: { ...e.c.casos.auth, invitarAdminInicial: async () => Promise.reject(new Error('sin correo')) } } }
    await expect(tareasDeArranque(roto as never, { ...e.c.env, ADMIN_INICIAL_CORREO: 'dueno@larejana.co' })).resolves.toBeUndefined()
  })
})

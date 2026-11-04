import { diaBogota, type ReporteTurnosDTO, type TurnoDTO } from '@rejana/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsSeed, levantar, Navegador, type Entorno } from '../ayudas'

let e: Entorno
let ids: Awaited<ReturnType<typeof idsSeed>>
let admin: Navegador
const HORA = 3_600_000

beforeAll(async () => {
  e = await levantar()
  // Reloj fijo a las 8:00 de hoy en Bogotá: así las horas sumadas en las pruebas no cruzan la medianoche.
  e.reloj.t = new Date(`${diaBogota()}T08:00:00-05:00`).getTime()
  ids = await idsSeed(e.c)
  admin = new Navegador(e.app)
  await admin.ingresar('admin@larejana.test')
})
afterAll(async () => {
  await e.cerrar()
})

async function empleado(correo: string) {
  const n = new Navegador(e.app)
  await n.ingresar(correo)
  return n
}

describe('turnos: el personal marca entrada y salida', () => {
  it('marca entrada y salida con la hora del servidor; no hay dos turnos abiertos', async () => {
    const cocina = await empleado('cocina.villaluz@larejana.test')
    expect((await cocina.get('/api/turnos/actual')).json().turno).toBeNull()

    const inicio = e.reloj.t
    const r = await cocina.post('/api/turnos/entrada')
    expect(r.statusCode).toBe(201)
    const turno = r.json<{ turno: TurnoDTO }>().turno
    expect(turno).toMatchObject({ abierto: true, sedeId: ids.villaluz, minutos: 0, rol: 'cocina' })
    expect(new Date(turno.entradaEn).getTime()).toBe(inicio)

    const doble = await cocina.post('/api/turnos/entrada')
    expect(doble.statusCode).toBe(409)
    expect(doble.json().error.mensaje).toMatch(/Ya marcaste/)

    e.reloj.t += 8 * HORA + 30 * 60_000
    expect((await cocina.get('/api/turnos/actual')).json<{ turno: TurnoDTO }>().turno.minutos).toBe(510)
    const salida = await cocina.post('/api/turnos/salida')
    expect(salida.statusCode).toBe(200)
    expect(salida.json<{ turno: TurnoDTO }>().turno).toMatchObject({ abierto: false, minutos: 510, cerradoPorAdmin: false })
    expect((await cocina.post('/api/turnos/salida')).statusCode).toBe(409)
    expect((await cocina.get('/api/turnos/actual')).json().turno).toBeNull()
  })

  it('solo marcan turnos los empleados con sede (no clientes ni el admin)', async () => {
    const cliente = await empleado('cliente@larejana.test')
    expect((await cliente.post('/api/turnos/entrada')).statusCode).toBe(403)
    expect((await admin.post('/api/turnos/entrada')).statusCode).toBe(403)
    expect((await new Navegador(e.app).post('/api/turnos/entrada')).statusCode).toBe(401)
    for (const correo of ['mesero.villaluz@larejana.test', 'caja.normandia@larejana.test', 'domi.villaluz@larejana.test']) {
      const n = await empleado(correo)
      expect((await n.post('/api/turnos/entrada')).statusCode).toBe(201)
    }
  })
})

describe('turnos: reporte del admin', () => {
  it('lista los turnos con las horas por persona y filtra por sede', async () => {
    const reporte = (await admin.get('/api/admin/turnos?periodo=hoy')).json<{ reporte: ReporteTurnosDTO }>().reporte
    const cocina = reporte.resumen.find((r) => r.usuarioNombre === 'Carlos Díaz')!
    expect(cocina).toMatchObject({ turnos: 1, minutos: 510, abiertos: 0, rol: 'cocina', sedeNombre: 'Villaluz' })
    expect(reporte.turnos.some((t) => t.sedeNombre === 'Normandía')).toBe(true)

    const soloVillaluz = (await admin.get(`/api/admin/turnos?periodo=hoy&sedeId=${ids.villaluz}`)).json<{ reporte: ReporteTurnosDTO }>().reporte
    expect(soloVillaluz.turnos.every((t) => t.sedeId === ids.villaluz)).toBe(true)
    expect(soloVillaluz.turnos.some((t) => t.abierto)).toBe(true)

    const caja = await empleado('caja.villaluz@larejana.test')
    expect((await caja.get('/api/admin/turnos?periodo=hoy')).statusCode).toBe(403)
  })

  it('el admin cierra un turno olvidado con la hora real; queda marcado como revisado y en la auditoría', async () => {
    e.reloj.t += 20 * HORA
    const reporte = (await admin.get('/api/admin/turnos?periodo=ultimos_7_dias')).json<{ reporte: ReporteTurnosDTO }>().reporte
    const olvidado = reporte.turnos.find((t) => t.usuarioNombre === 'Valentina Ruiz' && t.abierto)!
    expect(olvidado.revisar).toBe(true)

    const entrada = new Date(olvidado.entradaEn).getTime()
    const antes = await admin.post(`/api/admin/turnos/${olvidado.id}/cerrar`, { salidaEn: new Date(entrada - 60_000).toISOString(), nota: 'Olvidó marcar la salida' })
    expect(antes.statusCode).toBe(422)
    const futuro = await admin.post(`/api/admin/turnos/${olvidado.id}/cerrar`, { salidaEn: new Date(e.reloj.t + HORA).toISOString(), nota: 'Olvidó marcar la salida' })
    expect(futuro.statusCode).toBe(422)

    const r = await admin.post(`/api/admin/turnos/${olvidado.id}/cerrar`, { salidaEn: new Date(entrada + 9 * HORA).toISOString(), nota: 'Olvidó marcar la salida' })
    expect(r.statusCode).toBe(200)
    expect(r.json<{ turno: TurnoDTO }>().turno).toMatchObject({ abierto: false, minutos: 540, cerradoPorAdmin: true, nota: 'Olvidó marcar la salida', revisar: false })
    expect((await admin.post(`/api/admin/turnos/${olvidado.id}/cerrar`, { salidaEn: new Date(entrada + HORA).toISOString(), nota: 'Otra vez' })).statusCode).toBe(409)

    const auditoria = await e.c.uow.repos.auditoria.listar({ limite: 20 })
    expect(auditoria.some((x) => x.accion === 'turno.cerrar' && x.entidadId === olvidado.id)).toBe(true)

    const mesero = await empleado('mesero.villaluz@larejana.test')
    expect((await mesero.get('/api/turnos/actual')).json().turno).toBeNull()
  })
})

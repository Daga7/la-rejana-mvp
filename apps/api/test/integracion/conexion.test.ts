import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { levantar, ORIGEN_WEB, type Entorno } from '../ayudas'

// Conexión a PostgreSQL y la IP del cliente tal como quedan en Railway (TRUST_PROXY_HOPS=1).

let e: Entorno
beforeAll(async () => {
  e = await levantar({ env: { TRUST_PROXY_HOPS: '1' } })
})
afterAll(async () => {
  await e.cerrar()
})

describe('conexión', () => {
  it('cada conexión del pool trae el límite de 15 s por consulta', async () => {
    const { rows } = await e.c.conexion.db.execute<{ limite: string }>(sql`select current_setting('statement_timeout') as limite`)
    expect(rows[0]!.limite).toBe('15s')
  })
})

describe('IP del cliente detrás del proxy de Railway (TRUST_PROXY_HOPS=1)', () => {
  /** Inicia sesión como lo haría un navegador que llega directo a la API por el borde de Railway. */
  async function ingresarDirecto(xff: string, extra: Record<string, string> = {}) {
    const base = { remoteAddress: '100.64.0.7', headers: { 'x-forwarded-for': xff, origin: ORIGEN_WEB, ...extra } }
    const csrf = await e.app.inject({ method: 'GET', url: '/api/auth/csrf', ...base })
    const cookie = [csrf.headers['set-cookie']].flat().map((c) => String(c).split(';')[0]).join('; ')
    const r = await e.app.inject({ method: 'POST', url: '/api/auth/ingresar', ...base, headers: { ...base.headers, cookie, 'x-csrf-token': csrf.json().token }, payload: { correo: 'admin@larejana.test', clave: 'Rejana2026*' } })
    expect(r.statusCode).toBe(200)
    return (await e.c.conexion.db.execute<{ ip: string }>(sql`select ip from sesiones order by creado_en desc limit 1`)).rows[0]!.ip
  }

  it('usa la IP que agrega el borde de Railway, no la que inventa el cliente', async () => {
    expect(await ingresarDirecto('203.0.113.9')).toBe('203.0.113.9')
    expect(await ingresarDirecto('6.6.6.6, 203.0.113.9')).toBe('203.0.113.9')
  })

  it('con el secreto del proxy de la web manda la IP que reenvía la web', async () => {
    expect(await ingresarDirecto('198.51.100.20', { 'x-rejana-proxy-secret': 'secreto-de-pruebas-con-mas-de-32-caracteres-3', 'x-rejana-client-ip': '190.85.1.2' })).toBe('190.85.1.2')
  })
})

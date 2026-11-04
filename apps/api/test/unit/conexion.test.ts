import { describe, expect, it } from 'vitest'
import { certificadoPem, opcionesBDDelEntorno, prepararConexion } from '../../src/adapters/db/cliente'

const SUPABASE = 'postgresql://postgres.abcdefghijklmnop:clave123@aws-0-us-east-1.pooler.supabase.com:5432/postgres'

describe('conexión a PostgreSQL (Supabase por el pooler)', () => {
  it('sin TLS deja la URL tal cual', () => {
    expect(prepararConexion('postgres://rejana:x@127.0.0.1:5433/rejana')).toEqual({ url: 'postgres://rejana:x@127.0.0.1:5433/rejana', ssl: undefined })
  })

  it('con DATABASE_SSL cifra sin verificar si no hay certificado', () => {
    expect(prepararConexion(SUPABASE, { ssl: true })).toEqual({ url: SUPABASE, ssl: { rejectUnauthorized: false } })
  })

  it('con el certificado del proveedor verifica servidor y nombre', () => {
    expect(prepararConexion(SUPABASE, { ssl: true, ca: 'PEM' }).ssl).toEqual({ ca: 'PEM', rejectUnauthorized: true })
  })

  it('quita sslmode de la URL (pg lo aplicaría encima y exigiría verificar) pero mantiene el cifrado', () => {
    const r = prepararConexion(`${SUPABASE}?sslmode=require&application_name=x`)
    expect(r.url).toBe(`${SUPABASE}?application_name=x`)
    expect(r.ssl).toEqual({ rejectUnauthorized: false })
    expect(prepararConexion(`${SUPABASE}?sslmode=disable`, { ssl: true })).toEqual({ url: SUPABASE, ssl: { rejectUnauthorized: false } })
  })

  it('conserva contraseñas codificadas en la URL', () => {
    const url = 'postgresql://postgres.ref:p%40ss%2Fw0rd@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
    expect(prepararConexion(url).url).toBe('postgresql://postgres.ref:p%40ss%2Fw0rd@aws-0-sa-east-1.pooler.supabase.com:5432/postgres')
  })

  it('lee el certificado pegado en una sola línea con \\n', () => {
    expect(certificadoPem('-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----')).toBe('-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----')
    expect(certificadoPem('  ')).toBeUndefined()
    expect(opcionesBDDelEntorno({ DATABASE_SSL: 'true' })).toEqual({ ssl: true, ca: undefined })
    expect(opcionesBDDelEntorno({})).toEqual({ ssl: false, ca: undefined })
  })
})

import { describe, expect, it } from 'vitest'
import { cargarEnv } from '../../src/config/env'

const SUPABASE = 'postgresql://postgres.abcdefghijklmnop:clave123@aws-0-us-east-1.pooler.supabase.com:5432/postgres'

describe('variables de despliegue', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: SUPABASE,
    WEB_ORIGIN: 'https://rejana.vercel.app',
    JWT_SECRET: 'x'.repeat(40),
    TOKENS_PEPPER: 'y'.repeat(40),
    COOKIE_SECURE: 'true',
  }

  it('los datos de prueba y la invitación inicial vienen apagados', () => {
    const env = cargarEnv(base)
    expect(env.SEED_AL_INICIAR).toBe(false)
    expect(env.ADMIN_INICIAL_CORREO).toBeUndefined()
    expect(env.DATABASE_POOL_MAX).toBe(10)
    expect(cargarEnv({ ...base, DATABASE_POOL_MAX: '5' })).toMatchObject({ DATABASE_POOL_MAX: 5 })
  })

  it('en producción el seed exige la confirmación explícita', () => {
    expect(() => cargarEnv({ ...base, SEED_AL_INICIAR: 'true' })).toThrow(/SEED_PERMITIR_PRODUCCION/)
    expect(cargarEnv({ ...base, SEED_AL_INICIAR: 'true', SEED_PERMITIR_PRODUCCION: 'true' }).SEED_AL_INICIAR).toBe(true)
  })

  it('valida el correo del primer administrador', () => {
    expect(() => cargarEnv({ ...base, ADMIN_INICIAL_CORREO: 'no-es-correo' })).toThrow(/ADMIN_INICIAL_CORREO/)
    expect(cargarEnv({ ...base, ADMIN_INICIAL_CORREO: ' Daniel@Ejemplo.co ' }).ADMIN_INICIAL_CORREO).toBe('Daniel@Ejemplo.co')
  })
})

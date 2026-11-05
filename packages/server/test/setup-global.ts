import { sql } from 'drizzle-orm'
import { conectarBD } from '../src/adapters/db/cliente'
import { aplicarMigraciones } from '../src/adapters/db/migrar'

/** Recrea el esquema de la base de pruebas y aplica las migraciones una vez por corrida. */
export default async function () {
  const url = process.env.DATABASE_URL_TEST
  if (!url) {
    console.warn('DATABASE_URL_TEST no está definida: se omiten las pruebas de integración')
    return
  }
  const c = conectarBD(url, { max: 1 })
  await c.db.execute(sql`drop schema if exists public cascade`)
  await c.db.execute(sql`drop schema if exists drizzle cascade`)
  await c.db.execute(sql`create schema public`)
  await c.cerrar()
  await aplicarMigraciones(url)
}

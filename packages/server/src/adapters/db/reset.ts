import { sql } from 'drizzle-orm'
import { conectarBD } from './cliente'
import { aplicarMigraciones } from './migrar'
import { sembrar } from './seed'

// Borra TODO, aplica migraciones y carga los datos de prueba. Solo para desarrollo.
if (process.env.NODE_ENV === 'production') {
  console.error('✖ db:reset no se ejecuta en producción.')
  process.exit(1)
}
const url = process.env.DATABASE_URL!
const conexion = conectarBD(url, { max: 1 })
await conexion.db.execute(sql`drop schema if exists public cascade`)
await conexion.db.execute(sql`drop schema if exists drizzle cascade`)
await conexion.db.execute(sql`create schema public`)
await conexion.cerrar()
await aplicarMigraciones(url)
console.log('✔ Esquema recreado')
const c2 = conectarBD(url, { max: 2 })
await sembrar(c2.db, { pimienta: process.env.TOKENS_PEPPER ?? '' })
await c2.cerrar()
console.log('✔ Base de datos lista')

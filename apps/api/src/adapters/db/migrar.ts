import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { conectarBD } from './cliente'

/** Aplica las migraciones versionadas de ./drizzle. Se usa en desarrollo, en pruebas y como pre-deploy en Railway. */
export async function aplicarMigraciones(url: string, ssl = false): Promise<void> {
  const carpeta = process.env.MIGRACIONES_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle')
  const conexion = conectarBD(url, { ssl, max: 1 })
  try {
    await migrate(conexion.db, { migrationsFolder: carpeta })
  } finally {
    await conexion.cerrar()
  }
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (esPrincipal) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  aplicarMigraciones(url, process.env.DATABASE_SSL === 'true')
    .then(() => {
      console.log('✔ Migraciones aplicadas')
    })
    .catch((e) => {
      console.error('✖ Error aplicando migraciones', e)
      process.exit(1)
    })
}

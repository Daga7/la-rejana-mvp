// Lanza Next.js cargando antes el .env de la raíz del monorepo (solo desarrollo local).
// Así lo heredan todos los procesos de Next. No toca NODE_ENV (Next lo define) ni pisa variables
// que ya vengan del entorno (Railway, Vercel, CI).
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const archivo = new URL('../../../.env', import.meta.url)
if (existsSync(archivo)) {
  for (const [clave, valor] of Object.entries(parseEnv(readFileSync(archivo, 'utf8')))) {
    if (clave !== 'NODE_ENV' && process.env[clave] === undefined) process.env[clave] = valor
  }
}
const require = createRequire(import.meta.url)
const bin = require.resolve('next/dist/bin/next')
process.argv = [process.argv[0], bin, ...process.argv.slice(2)]
// En Windows, import() exige una URL file:// (una ruta nativa "C:\..." no es un esquema soportado).
await import(pathToFileURL(bin))

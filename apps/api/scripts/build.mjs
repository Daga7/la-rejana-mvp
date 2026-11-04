// Empaqueta la API con esbuild. Las dependencias de npm quedan externas (se instalan en la imagen);
// el paquete del monorepo @rejana/shared (TypeScript) sí se incluye en el bundle.
import { readFile, rm } from 'node:fs/promises'
import { build } from 'esbuild'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const externas = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@rejana/'))

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true })
await build({
  entryPoints: { main: 'src/main.ts', migrar: 'src/adapters/db/migrar.ts', 'crear-admin': 'src/adapters/db/crear-admin.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [...externas, ...externas.map((d) => `${d}/*`)],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
})

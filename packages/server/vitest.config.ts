import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// En local las variables vienen del .env de la raíz; en CI, del entorno del workflow.
if (existsSync('../../.env')) process.loadEnvFile('../../.env')

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/setup-global.ts'],
    // Las pruebas de integración comparten una base de datos: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: 'test' },
  },
})

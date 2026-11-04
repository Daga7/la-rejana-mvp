import { defineConfig, devices } from '@playwright/test'

// Pruebas de punta a punta contra la app corriendo (pnpm dev o build + start) y la API con datos de prueba.
// Usa el Chromium del sistema: CHROMIUM_PATH=/usr/bin/chromium pnpm --filter @rejana/web e2e
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    geolocation: { latitude: 4.6921, longitude: -74.1052 },
    permissions: ['geolocation'],
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'movil', use: { ...devices['Pixel 7'] } }],
})

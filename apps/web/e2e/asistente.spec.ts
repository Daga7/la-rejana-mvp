import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })

test('el admin prueba el asistente y descarga el PDF del reporte', async ({ page }) => {
  await page.goto('/ingresar')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Correo').fill('admin@larejana.test')
  await page.getByLabel('Contraseña', { exact: true }).fill('Rejana2026*')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/admin/)
  await page.getByRole('link', { name: 'Asistente' }).click()
  await expect(page.getByText(/Conexión con WhatsApp/)).toBeVisible()
  await page.getByRole('button', { name: 'Envíame el reporte de ventas de este mes' }).click()
  await expect(page.getByText(/Entendí:/)).toContainText('Ventas · todas las sedes · este mes')
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Descargar rejana-ventas-/ }).click()])
  const ruta = await descarga.path()
  expect((await readFile(ruta)).subarray(0, 5).toString()).toBe('%PDF-')
  if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/10-asistente.png', fullPage: true })
})

import { test } from '@playwright/test'

// Capturas para revisión visual (no son aserciones). CAPTURAS=1 pnpm e2e capturas
test.skip(!process.env.CAPTURAS, 'Solo bajo demanda')

test('capturas del flujo de compra', async ({ page }) => {
  await page.goto('/menu')
  await page.getByRole('button', { name: /^La Rejana / }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/capturas/1-producto.png' })
  await page.getByRole('dialog').getByRole('button', { name: /^Agregar ·/ }).click()
  await page.goto('/checkout')
  await page.getByRole('button', { name: /Usar mi ubicación/ }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/capturas/2-checkout.png', fullPage: true })
  await page.getByLabel('Dirección', { exact: true }).fill('Calle 70 # 79-10')
  await page.getByLabel('Nombre', { exact: true }).fill('Juana Prueba')
  await page.getByLabel('Celular').fill('310 555 1234')
  await page.getByRole('radio', { name: /QR/ }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Confirmar pedido/ }).click()
  await page.waitForURL(/\/pedido\//)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/capturas/3-seguimiento.png', fullPage: true })
})

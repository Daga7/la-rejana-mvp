import { expect, test, type Page } from '@playwright/test'

async function ingresar(page: Page, correo: string) {
  await page.goto('/ingresar')
  // Espera a que React hidrate: si se escribe antes, la hidratación reinicia los campos controlados.
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña', { exact: true }).fill('Rejana2026*')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/ingresar'))
}

test.describe('módulos del personal', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })

  test('admin: tablero con gráficas e inventario', async ({ page }) => {
    await ingresar(page, 'admin@larejana.test')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible()
    await expect(page.getByText('Ventas diarias por sede')).toBeVisible()
    await expect(page.getByText('Lo más pedido del mes')).toBeVisible()
    await expect(page.getByText('Ventas del mes')).toBeVisible()
    // Vista de tabla de la gráfica (accesibilidad)
    await page.getByRole('button', { name: 'Ver tabla' }).first().click()
    await expect(page.getByRole('columnheader', { name: 'Villaluz' })).toBeVisible()
    await page.getByRole('button', { name: 'Ver gráfica' }).first().click()
    if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/6-tablero.png', fullPage: true })

    await page.getByRole('link', { name: 'Inventario', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible()
    await page.getByRole('button', { name: 'Registrar entrada de Pan brioche' }).click()
    await page.getByRole('dialog').getByRole('textbox').first().fill('10')
    await page.getByRole('dialog').getByRole('button', { name: 'Registrar entrada' }).click()
    await expect(page.getByText(/Saldo nuevo:/)).toBeVisible()
    if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/7-inventario.png', fullPage: true })
  })

  test('cocina mueve un pedido con un toque', async ({ page }) => {
    await ingresar(page, 'cocina.villaluz@larejana.test')
    await expect(page).toHaveURL(/\/cocina$/)
    const nuevos = page.locator('section', { has: page.getByRole('heading', { name: /Nuevos/ }) })
    const parrilla = page.locator('section', { has: page.getByRole('heading', { name: /En la parrilla/ }) })
    const antes = await parrilla.locator('article').count()
    await nuevos.getByRole('button', { name: 'Empezar' }).first().click()
    await expect(parrilla.locator('article')).toHaveCount(antes + 1)
    if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/8-cocina.png', fullPage: true })
  })

  test('caja ve los pedidos por etapa y abre el cobro', async ({ page }) => {
    await ingresar(page, 'caja.villaluz@larejana.test')
    await expect(page).toHaveURL(/\/caja$/)
    await page.getByRole('tab', { name: /Por despachar/ }).click()
    await page.locator('li button[aria-expanded]').first().click()
    await page.getByRole('button', { name: 'Registrar pago' }).click()
    await expect(page.getByRole('dialog')).toContainText('Cobrar pedido')
    if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/9-caja.png', fullPage: true })
  })
})

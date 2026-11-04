import { expect, test, type Page } from '@playwright/test'

async function ingresar(page: Page, correo: string) {
  await page.goto('/ingresar')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña', { exact: true }).fill('Rejana2026*')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/ingresar'))
}

test('un empleado envía una sugerencia anónima y el admin la lee sin autor', async ({ browser }) => {
  const texto = `Sería bueno tener impermeables nuevos para la lluvia ${Date.now()}`
  const domi = await (await browser.newContext()).newPage()
  await ingresar(domi, 'domi.villaluz@larejana.test')
  await expect(domi).toHaveURL(/\/domiciliario/)
  await domi.getByRole('link', { name: /Buzón/ }).click()
  await domi.getByRole('textbox').fill(texto)
  await expect(domi.getByRole('checkbox')).toBeChecked() // anónimo por defecto
  await domi.getByRole('button', { name: /Enviar sugerencia/ }).click()
  await expect(domi.getByText('¡Mensaje enviado!')).toBeVisible()

  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  await ingresar(admin, 'admin@larejana.test')
  await admin.goto('/admin/buzon')
  const tarjeta = admin.locator('li', { hasText: texto })
  await expect(tarjeta).toBeVisible()
  await expect(tarjeta).toContainText('Anónimo')
  await expect(tarjeta).not.toContainText('Jhon')
  await tarjeta.getByRole('button', { name: /En revisión/ }).click()
  await expect(admin.getByText(/Marcado como «En revisión»/)).toBeVisible()
})

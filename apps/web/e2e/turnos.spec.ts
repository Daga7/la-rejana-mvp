import { expect, test, type APIRequestContext } from '@playwright/test'

const BASE = process.env.E2E_URL ?? 'http://localhost:3000'

async function sesion(req: APIRequestContext, correo: string) {
  const { token } = await (await req.get('/api/auth/csrf')).json()
  const h = { 'x-csrf-token': token, origin: BASE }
  const r = await req.post('/api/auth/ingresar', { data: { correo, clave: 'Rejana2026*' }, headers: h })
  expect(r.status()).toBe(200)
  return h
}

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })

test('un empleado marca entrada y salida, y el admin ve el turno con sus horas', async ({ page, browser }) => {
  await sesion(page.request, 'caja.normandia@larejana.test')
  await page.goto('/caja')
  // Si quedó un turno abierto de una corrida anterior, se cierra primero.
  const enTurno = page.getByRole('button', { name: /En turno/ })
  if (await enTurno.isVisible().catch(() => false)) {
    await enTurno.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Marcar salida' }).click()
  }
  await page.getByRole('button', { name: 'Marcar entrada' }).click()
  await expect(page.getByText(/Entrada marcada a las/)).toBeVisible()
  await page.getByRole('button', { name: /En turno/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar salida' }).click()
  await expect(page.getByText(/Salida marcada: trabajaste/)).toBeVisible()

  const admin = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } })
  await sesion(admin.request, 'admin@larejana.test')
  const pa = await admin.newPage()
  await pa.goto('/admin/turnos')
  await pa.getByLabel('Periodo').selectOption('hoy')
  await expect(pa.getByRole('cell', { name: 'Camilo Rojas' }).first()).toBeVisible()
  if (process.env.CAPTURAS) await pa.screenshot({ path: 'test-results/capturas/15-turnos.png', fullPage: true })
})

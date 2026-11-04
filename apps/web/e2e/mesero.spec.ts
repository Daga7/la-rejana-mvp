import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const BASE = process.env.E2E_URL ?? 'http://localhost:3000'

async function ingresar(page: Page, correo: string) {
  await page.goto('/ingresar')
  // Espera a que React hidrate: si se escribe antes, la hidratación reinicia los campos controlados.
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña', { exact: true }).fill('Rejana2026*')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/ingresar'))
}

async function sesion(req: APIRequestContext, correo: string) {
  const { token } = await (await req.get('/api/auth/csrf')).json()
  const h = { 'x-csrf-token': token, origin: BASE }
  const r = await req.post('/api/auth/ingresar', { data: { correo, clave: 'Rejana2026*' }, headers: h })
  expect(r.status()).toBe(200)
  return h
}

test('el mesero abre una mesa, envía la ronda, la sirve en vivo y la caja cobra la cuenta dividida', async ({ page, browser }) => {
  // 1. El mesero (en el celular) abre la mesa 4 y toma el pedido
  await ingresar(page, 'mesero.villaluz@larejana.test')
  await expect(page).toHaveURL(/\/mesero$/)
  await page.getByRole('button', { name: /^Mesa 4\b/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Abrir y tomar el pedido/ }).click()
  await page.waitForURL(/\/mesero\/cuenta\//)
  await page.getByRole('button', { name: /^La Callejera/ }).click()
  await page.getByRole('button', { name: /^La Callejera/ }).click()
  await page.getByRole('tab', { name: 'Choriperros' }).click()
  await page.getByRole('button', { name: /^Choriperro Clásico/ }).click()
  await page.getByRole('button', { name: /Revisar y enviar/ }).click()
  await page.getByRole('button', { name: /Agregar nota/ }).nth(1).click()
  await page.getByLabel('Nota para Choriperro Clásico').fill('sin piña')
  if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/11-mesa-por-enviar.png', fullPage: true })
  await page.getByRole('button', { name: /Enviar a la cocina \(3\)/ }).click()
  await expect(page.getByText('En cola')).toBeVisible()
  const cuentaId = page.url().split('/').pop()!

  // 2. La cocina la prepara (por la API, a través del proxy de la web)
  const cocina = await browser.newContext({ baseURL: BASE })
  const h = await sesion(cocina.request, 'cocina.villaluz@larejana.test')
  const { cuenta } = await (await page.request.get(`/api/cuentas/${cuentaId}`)).json()
  const ronda = cuenta.rondas[0]
  expect(ronda.items).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Choriperro Clásico', notas: 'sin piña' })]))
  for (const estado of ['en_preparacion', 'listo']) expect((await cocina.request.patch(`/api/pedidos/${ronda.id}/estado`, { data: { estado }, headers: h })).status()).toBe(200)

  // 3. Al mesero le llega en vivo, la sirve y pide la cuenta
  await page.getByRole('button', { name: /Ya lo serví/ }).click({ timeout: 15_000 })
  await expect(page.getByText('Servida')).toBeVisible()
  await page.getByRole('button', { name: /Pedir la cuenta/ }).click()
  await expect(page.getByText(/Cuenta solicitada/)).toBeVisible()
  if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/12-mesa-cuenta.png', fullPage: true })

  // 4. La caja cobra: propina voluntaria y cuenta dividida en partes iguales
  const caja = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } })
  await sesion(caja.request, 'caja.villaluz@larejana.test')
  const pc = await caja.newPage()
  await pc.goto('/caja')
  await pc.getByRole('tab', { name: /Mesas/ }).click()
  await pc.getByRole('button', { name: /^4 Mesa 4/ }).click()
  const hoja = pc.getByRole('dialog')
  await expect(hoja).toContainText('Consumo')
  await hoja.getByLabel(/acepta la propina/).check()
  await hoja.getByRole('button', { name: /Dividir la cuenta/ }).click()
  await hoja.getByRole('button', { name: 'Partes iguales' }).click()
  if (process.env.CAPTURAS) await pc.screenshot({ path: 'test-results/capturas/13-caja-cobro-mesa.png', fullPage: true })
  await hoja.getByRole('button', { name: /Cobrar y liberar la mesa/ }).click()
  await expect(pc.getByText(/Mesa 4 cobrada y libre/)).toBeVisible()

  // 5. En el salón, la mesa vuelve a estar libre
  await page.goto('/mesero')
  await expect(page.getByRole('button', { name: /^Mesa 4\b.*libre/i })).toBeVisible()
})

test('desde el plano, el mesero traslada una mesa y le junta otra para un grupo', async ({ page }) => {
  await ingresar(page, 'mesero.villaluz@larejana.test')
  await page.getByRole('tab', { name: 'Terraza' }).click()
  await page.getByRole('button', { name: /^Mesa 7\b/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Abrir y tomar el pedido/ }).click()
  await page.waitForURL(/\/mesero\/cuenta\//)

  await page.getByRole('button', { name: /Mover o juntar/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Trasladar a la mesa 9' }).click()
  await expect(page.getByRole('heading', { name: 'Mesa 9' })).toBeVisible()

  await page.getByRole('button', { name: /Mover o juntar/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Juntar la mesa 10\b/ }).click()
  await expect(page.getByRole('heading', { name: 'Mesa 9 + 10' })).toBeVisible()
  if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/14-mesas-juntas.png', fullPage: true })

  await page.goto('/mesero')
  await page.getByRole('tab', { name: 'Terraza' }).click()
  await expect(page.getByRole('button', { name: /^Mesa 10\b.*junta con la mesa 9/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Mesa 7\b.*libre/ })).toBeVisible()

  // Sin pedidos, el grupo se va y las dos mesas quedan libres
  await page.getByRole('button', { name: /^Mesa 9\b/ }).click()
  await page.getByRole('tab', { name: /^Cuenta/ }).click()
  await page.getByRole('button', { name: 'Liberar la mesa' }).click()
  await page.waitForURL(/\/mesero$/)
  await page.getByRole('tab', { name: 'Terraza' }).click()
  await expect(page.getByRole('button', { name: /^Mesa 10\b.*libre/ })).toBeVisible()
})


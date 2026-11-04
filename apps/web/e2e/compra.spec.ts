import { expect, request, test } from '@playwright/test'

test('un invitado pide a domicilio y sigue su pedido', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Continuar como invitado/ }).click()
  await expect(page).toHaveURL(/\/menu/)

  // Agrega dos productos
  await page.getByRole('button', { name: /^La Callejera / }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Agregar uno' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Agregar ·/ }).click()
  await page.getByRole('button', { name: /^Choriperro Clásico / }).click()
  await page.getByRole('dialog').getByPlaceholder(/sin cebolla/).fill('sin piña')
  await page.getByRole('dialog').getByRole('button', { name: /^Agregar ·/ }).click()

  await page.goto('/carrito')
  await expect(page.getByText('La Callejera')).toBeVisible()
  await expect(page.getByText('«sin piña»')).toBeVisible()
  await page.getByRole('link', { name: /Continuar/ }).click()
  await expect(page).toHaveURL(/\/checkout/)

  // Punto de entrega: usa la ubicación (geolocalización simulada cerca de Villaluz)
  await page.getByRole('button', { name: /Usar mi ubicación/ }).click()
  await expect(page.getByText(/Estás a .* km de la sede/)).toBeVisible()
  await page.getByLabel('Dirección', { exact: true }).fill('Calle 70 # 79-10')
  await page.getByLabel('Nombre', { exact: true }).fill('Juana Prueba')
  await page.getByLabel('Celular').fill('310 555 1234')
  await page.getByRole('radio', { name: /Efectivo/ }).click()
  await page.getByRole('button', { name: '$ 100.000' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Confirmar pedido/ }).click()

  // Seguimiento
  await expect(page).toHaveURL(/\/pedido\/[0-9a-f-]{36}/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /Recibimos tu pedido/i })).toBeVisible()
  await expect(page.getByText(/Pedido #\d+/)).toBeVisible()
  await expect(page.getByText('2× La Callejera')).toBeVisible()

  // Tiempo real: la cocina cambia el estado y la pantalla se actualiza sola
  await expect(page.getByText(/● En vivo/)).toBeVisible({ timeout: 15_000 })
  const pedidoId = page.url().split('/pedido/')[1]!.split('?')[0]!
  const base = process.env.E2E_URL ?? 'http://localhost:3000'
  const cocina = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } })
  const { token } = await (await cocina.get('/api/auth/csrf')).json()
  const h = { 'x-csrf-token': token }
  expect((await cocina.post('/api/auth/ingresar', { data: { correo: 'cocina.villaluz@larejana.test', clave: 'Rejana2026*' }, headers: h })).status()).toBe(200)
  expect((await cocina.patch(`/api/pedidos/${pedidoId}/estado`, { data: { estado: 'en_preparacion' }, headers: h })).status()).toBe(200)
  await expect(page.getByRole('heading', { name: /En la parrilla/i })).toBeVisible({ timeout: 5_000 })
  await cocina.dispose()

  // Aparece en "Mis pedidos" del dispositivo y el carrito quedó vacío
  await page.goto('/mis-pedidos')
  await expect(page.getByText(/Pedido #\d+/).first()).toBeVisible()
  await page.goto('/carrito')
  await expect(page.getByText('Tu carrito está vacío')).toBeVisible()
})

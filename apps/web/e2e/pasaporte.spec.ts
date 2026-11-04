import { expect, test, type APIRequestContext } from '@playwright/test'

const BASE = process.env.E2E_URL ?? 'http://localhost:3000'

async function sesion(req: APIRequestContext, correo: string) {
  const { token } = await (await req.get('/api/auth/csrf')).json()
  const h = { 'x-csrf-token': token, origin: BASE }
  const r = await req.post('/api/auth/ingresar', { data: { correo, clave: 'Rejana2026*' }, headers: h })
  expect(r.status()).toBe(200)
  return h
}

test('la clienta muestra su código, la caja lo verifica al cobrar la mesa y le llega el sello', async ({ page, browser }) => {
  // 1. Una mesa de Normandía con una ronda servida (por la API; Normandía para no cruzarse con las otras pruebas)
  const personal = await browser.newContext({ baseURL: BASE })
  const hMesero = await sesion(personal.request, 'mesero.normandia@larejana.test')
  const sedes = (await (await personal.request.get('/api/sedes')).json()).sedes as { id: string; slug: string }[]
  const sede = sedes.find((s) => s.slug === 'normandia')!
  const salon = (await (await personal.request.get(`/api/mesas/${sede.id}/salon`)).json()).salon as { mesas: { id: string; numero: number; cuenta: unknown }[] }
  const libre = salon.mesas.find((m) => !m.cuenta)!
  const cuenta = (await (await personal.request.post(`/api/mesas/${sede.id}/cuentas`, { data: { mesaId: libre.id, comensales: 2 }, headers: hMesero })).json()).cuenta
  const menu = await (await personal.request.get(`/api/sedes/${sede.id}/menu`)).json()
  const rejana = menu.categorias.flatMap((c: { productos: { id: string; slug: string }[] }) => c.productos).find((p: { slug: string }) => p.slug === 'la-rejana')
  const ronda = (await (await personal.request.post(`/api/cuentas/${cuenta.id}/rondas`, { data: { items: [{ productoId: rejana.id, cantidad: 1 }] }, headers: hMesero })).json()).pedido
  const hCocina = await sesion(personal.request, 'cocina.normandia@larejana.test')
  for (const estado of ['en_preparacion', 'listo']) expect((await personal.request.patch(`/api/pedidos/${ronda.id}/estado`, { data: { estado }, headers: hCocina })).status()).toBe(200)
  const hMesero2 = await sesion(personal.request, 'mesero.normandia@larejana.test')
  expect((await personal.request.patch(`/api/pedidos/${ronda.id}/estado`, { data: { estado: 'entregado' }, headers: hMesero2 })).status()).toBe(200)

  // 2. La clienta abre su pasaporte en el celular
  await sesion(page.request, 'cliente@larejana.test')
  await page.goto('/pasaporte')
  await expect(page.getByText('Tu tarjeta')).toBeVisible()
  const antes = Number((await page.getByText(/ de 8 sellos/).textContent())!.trim().split(' ')[0])
  const codigo = (await page.locator('p.font-mono').textContent())!.trim()
  if (process.env.CAPTURAS) await page.screenshot({ path: 'test-results/capturas/16-pasaporte.png', fullPage: true })

  // 3. La caja verifica el código y cobra: el sello llega con el cobro
  const caja = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } })
  await sesion(caja.request, 'caja.normandia@larejana.test')
  const pc = await caja.newPage()
  await pc.goto('/caja')
  await pc.getByRole('tab', { name: /Mesas/ }).click()
  await pc.getByRole('button', { name: new RegExp(`^${libre.numero} Mesa ${libre.numero}\\b`) }).click()
  const hoja = pc.getByRole('dialog')
  await hoja.getByLabel('Código del pasaporte del cliente').fill(codigo.toLowerCase())
  await hoja.getByRole('button', { name: 'Verificar' }).click()
  await expect(hoja.getByText(/^Ana/)).toBeVisible()
  await hoja.getByRole('button', { name: /Cobrar y liberar la mesa/ }).click()
  await expect(pc.getByText(/Sello para Ana/)).toBeVisible()

  await page.reload()
  await expect(page.getByText(`${Math.min(antes + 1, 8)} de 8 sellos`)).toBeVisible()
})

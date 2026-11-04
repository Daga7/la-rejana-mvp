import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const BASE = process.env.E2E_URL ?? 'http://localhost:3000'

/** Crea un pedido nuevo como invitado (por la API, a través del proxy de la web). Devuelve su número. */
async function pedidoNuevo(req: APIRequestContext): Promise<number> {
  const { token: csrf } = await (await req.get('/api/auth/csrf')).json()
  const sedes = (await (await req.get('/api/sedes')).json()).sedes as { id: string; slug: string }[]
  const villaluz = sedes.find((s) => s.slug === 'villaluz')!
  const menu = await (await req.get(`/api/sedes/${villaluz.id}/menu`)).json()
  const producto = menu.categorias.flatMap((c: { productos: { id: string; slug: string }[] }) => c.productos).find((p: { slug: string }) => p.slug === 'la-parchada')
  const creado = await req.post('/api/pedidos', {
    headers: { 'x-csrf-token': csrf, origin: BASE },
    data: {
      sedeId: villaluz.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
      contacto: { nombre: 'Prueba Cocina', telefono: '3105557777' },
      entrega: { direccion: 'Calle 72 # 79-30', lat: 4.6935, lng: -74.1041 },
      metodoPago: 'efectivo',
      aceptaPrivacidad: true,
    },
  })
  expect(creado.status()).toBe(201)
  return (await creado.json()).pedido.numero as number
}

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

  test('cocina mueve un pedido con un toque', async ({ page, browser }) => {
    // Pedido propio de la prueba: no depende de que queden pedidos sembrados sin empezar.
    const invitado = await browser.newContext({ baseURL: BASE })
    const numero = await pedidoNuevo(invitado.request)
    await invitado.close()

    await ingresar(page, 'cocina.villaluz@larejana.test')
    await expect(page).toHaveURL(/\/cocina$/)
    const nuevos = page.locator('section', { has: page.getByRole('heading', { name: /Nuevos/ }) })
    const parrilla = page.locator('section', { has: page.getByRole('heading', { name: /En la parrilla/ }) })
    const tarjeta = nuevos.locator('article', { hasText: `#${numero}` })
    await tarjeta.getByRole('button', { name: 'Empezar' }).click()
    await expect(parrilla.locator('article', { hasText: `#${numero}` })).toBeVisible()
    await expect(nuevos.locator('article', { hasText: `#${numero}` })).toHaveCount(0)
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

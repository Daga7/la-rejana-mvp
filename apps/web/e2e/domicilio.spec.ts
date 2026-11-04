import { expect, test, type APIRequestContext } from '@playwright/test'

const BASE = process.env.E2E_URL ?? 'http://localhost:3000'

async function sesion(req: APIRequestContext, correo: string) {
  const { token } = await (await req.get('/api/auth/csrf')).json()
  const h = { 'x-csrf-token': token, origin: BASE }
  const r = await req.post('/api/auth/ingresar', { data: { correo, clave: 'Rejana2026*' }, headers: h })
  expect(r.status()).toBe(200)
  return h
}

test('el domiciliario sale con la ruta y el cliente lo ve llegar en vivo', async ({ browser }) => {
  // 1. Un invitado hace un pedido (por la API, a través del proxy de la web)
  const invitado = await browser.newContext({ baseURL: BASE, geolocation: { latitude: 4.6921, longitude: -74.1052 }, permissions: ['geolocation'] })
  const { token: csrf } = await (await invitado.request.get('/api/auth/csrf')).json()
  const sedes = (await (await invitado.request.get('/api/sedes')).json()).sedes as { id: string; slug: string }[]
  const villaluz = sedes.find((s) => s.slug === 'villaluz')!
  const menu = await (await invitado.request.get(`/api/sedes/${villaluz.id}/menu`)).json()
  const callejera = menu.categorias.flatMap((c: { productos: { id: string; slug: string }[] }) => c.productos).find((p: { slug: string }) => p.slug === 'la-callejera')
  const creado = await invitado.request.post('/api/pedidos', {
    headers: { 'x-csrf-token': csrf, origin: BASE },
    data: {
      sedeId: villaluz.id,
      items: [{ productoId: callejera.id, cantidad: 1 }],
      contacto: { nombre: 'Cliente En Vivo', telefono: '3105559999' },
      entrega: { direccion: 'Calle 72 # 79-30', lat: 4.6935, lng: -74.1041 },
      metodoPago: 'efectivo',
      aceptaPrivacidad: true,
    },
  })
  expect(creado.status()).toBe(201)
  const { pedido, tokenSeguimiento } = await creado.json()
  const paginaCliente = await invitado.newPage()
  await paginaCliente.goto('/offline')
  await paginaCliente.evaluate(([id, token]) => localStorage.setItem('rejana-pedidos-invitado', JSON.stringify([{ id, token, creadoEn: new Date().toISOString() }])), [pedido.id, tokenSeguimiento])
  await paginaCliente.goto(`/pedido/${pedido.id}`)
  await expect(paginaCliente.getByText(/● En vivo/)).toBeVisible({ timeout: 15_000 })

  // 2. Cocina lo prepara y caja se lo asigna a Jhon
  const personal = await browser.newContext({ baseURL: BASE })
  const hCocina = await sesion(personal.request, 'cocina.villaluz@larejana.test')
  for (const estado of ['en_preparacion', 'listo']) expect((await personal.request.patch(`/api/pedidos/${pedido.id}/estado`, { data: { estado }, headers: hCocina })).status()).toBe(200)
  const hCaja = await sesion(personal.request, 'caja.villaluz@larejana.test')
  const doms = (await (await personal.request.get(`/api/operacion/domiciliarios?sedeId=${villaluz.id}`)).json()).domiciliarios as { id: string; nombre: string }[]
  const jhon = doms.find((x) => x.nombre.startsWith('Jhon'))!
  expect((await personal.request.post(`/api/pedidos/${pedido.id}/asignar`, { data: { domiciliarioId: jhon.id }, headers: hCaja })).status()).toBe(200)

  // 3. El domiciliario planea y sale (GPS simulado a mitad de camino)
  const domi = await browser.newContext({ baseURL: BASE, geolocation: { latitude: 4.6905, longitude: -74.1072 }, permissions: ['geolocation'], viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
  await sesion(domi.request, 'domi.villaluz@larejana.test')
  const paginaDomi = await domi.newPage()
  await paginaDomi.goto('/domiciliario')
  await paginaDomi.getByText(`#${pedido.numero}`).first().click()
  await paginaDomi.getByRole('button', { name: /Planear ruta/ }).click()
  await expect(paginaDomi.getByRole('dialog')).toContainText(/Ruta óptima/)
  await paginaDomi.getByRole('button', { name: /Iniciar recorrido/ }).click()
  await expect(paginaDomi.getByRole('heading', { name: /En recorrido/ })).toBeVisible()
  await expect(paginaDomi.getByText(/Compartiendo/)).toBeVisible({ timeout: 15_000 })

  // 4. El cliente ve que va en camino, el mapa y el tiempo estimado
  await expect(paginaCliente.getByRole('heading', { name: /Va en camino/ })).toBeVisible({ timeout: 10_000 })
  await expect(paginaCliente.getByText(/Llega en unos \d+ min/)).toBeVisible({ timeout: 15_000 })
  await expect(paginaCliente.getByText(/va hacia tu dirección/)).toBeVisible({ timeout: 15_000 })
  if (process.env.CAPTURAS) {
    await paginaCliente.waitForTimeout(1500)
    await paginaCliente.screenshot({ path: 'test-results/capturas/4-cliente-en-camino.png', fullPage: true })
    await paginaDomi.screenshot({ path: 'test-results/capturas/5-domiciliario.png', fullPage: true })
  }

  // 5. Entrega
  await paginaDomi.getByRole('button', { name: 'Entregado' }).click()
  await paginaDomi.getByRole('button', { name: /Sí, lo entregué/ }).click()
  await expect(paginaCliente.getByRole('heading', { name: /¡Entregado!/ })).toBeVisible({ timeout: 10_000 })

  await Promise.all([invitado.close(), personal.close(), domi.close()])
})

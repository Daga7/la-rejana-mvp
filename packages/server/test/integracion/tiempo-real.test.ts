import type { PedidoCreadoDTO } from '@rejana/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirFlujo, idsSeed, levantar, Navegador, ORIGEN_WEB, type Entorno, type FlujoSSE } from '../ayudas'

let e: Entorno
let ids: Awaited<ReturnType<typeof idsSeed>>
const flujos: FlujoSSE[] = []

beforeAll(async () => {
  e = await levantar()
  ids = await idsSeed(e.c)
})
afterAll(async () => {
  await Promise.all(flujos.map((f) => f.cerrar()))
  await e.cerrar()
})

async function pedido(): Promise<PedidoCreadoDTO> {
  const r = await new Navegador(e.app).post('/api/pedidos', {
    sedeId: ids.villaluz,
    items: [{ productoId: ids.producto('la-callejera'), cantidad: 1 }],
    contacto: { nombre: 'Tiempo Real', telefono: '3105551234' },
    entrega: { direccion: 'Calle 70 # 79-10', lat: 4.6921, lng: -74.1052 },
    metodoPago: 'efectivo',
    aceptaPrivacidad: true,
  })
  expect(r.statusCode).toBe(201)
  return r.json()
}

async function conectar(cabeceras: Record<string, string>, query: Record<string, string> = {}) {
  const f = await abrirFlujo(e.app, { origin: ORIGEN_WEB, ...cabeceras }, query)
  flujos.push(f)
  return f
}

describe('tiempo real (Server-Sent Events, mismo origen)', () => {
  it('el cliente recibe en vivo el cambio de estado de SU pedido y no el de otros', async () => {
    const a = await pedido()
    const b = await pedido()
    const f = await conectar({}, { pedidoId: a.pedido.id, token: a.tokenSeguimiento! })
    expect(await f.esperar<{ salas: string[] }>('conectado')).toMatchObject({ salas: [`pedido:${a.pedido.id}`] })

    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    await cocina.patch(`/api/pedidos/${b.pedido.id}/estado`, { estado: 'en_preparacion' })
    await cocina.patch(`/api/pedidos/${a.pedido.id}/estado`, { estado: 'en_preparacion' })
    const evento = await f.esperar<{ id: string; estado: string }>('pedido:estado')
    expect(evento).toMatchObject({ id: a.pedido.id, estado: 'en_preparacion' })
  })

  it('la cocina recibe los pedidos nuevos de su sede', async () => {
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    const f = await conectar({ cookie: cocina.cabeceraDeCookies() })
    await f.esperar('conectado')
    await pedido()
    expect(await f.esperar<{ estado: string; sedeId: string }>('pedido:actualizado')).toMatchObject({ estado: 'recibido', sedeId: ids.villaluz })
  })

  it('rechaza sin acceso a ninguna sala (invitado sin pedido)', async () => {
    const respuesta = await e.app.handle(new Request(new URL('/api/realtime/stream', 'http://localhost:3000'), { headers: { origin: ORIGEN_WEB } }))
    expect(respuesta.status).toBe(403)
  })

  it('rechaza un pedido que no es suyo (sin el token de seguimiento)', async () => {
    const a = await pedido()
    const respuesta = await e.app.handle(new Request(new URL(`/api/realtime/stream?pedidoId=${a.pedido.id}`, 'http://localhost:3000'), { headers: { origin: ORIGEN_WEB } }))
    expect(respuesta.status).toBe(404)
  })
})

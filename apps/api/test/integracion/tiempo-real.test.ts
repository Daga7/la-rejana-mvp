import type { PedidoCreadoDTO } from '@rejana/shared'
import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsSeed, levantar, Navegador, ORIGEN_WEB, type Entorno } from '../ayudas'

let e: Entorno
let ids: Awaited<ReturnType<typeof idsSeed>>
let url: string
const sockets: Socket[] = []

beforeAll(async () => {
  e = await levantar()
  ids = await idsSeed(e.c)
  await e.app.listen({ port: 0, host: '127.0.0.1' })
  const dir = e.app.server.address()
  url = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`
})
afterAll(async () => {
  for (const s of sockets) s.disconnect()
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

function conectar(ticket: string): Promise<Socket> {
  return new Promise((resolver, rechazar) => {
    const s = io(url, { path: '/socket.io', transports: ['websocket'], auth: { ticket }, extraHeaders: { origin: ORIGEN_WEB }, reconnection: false })
    sockets.push(s)
    s.on('connect', () => resolver(s))
    s.on('connect_error', (err) => rechazar(err))
  })
}

const esperar = <T,>(s: Socket, evento: string, ms = 3000) =>
  new Promise<T>((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error(`No llegó ${evento}`)), ms)
    s.once(evento, (d: T) => {
      clearTimeout(t)
      resolver(d)
    })
  })

describe('tiempo real (Socket.IO con ticket)', () => {
  it('el cliente recibe en vivo el cambio de estado de SU pedido y no el de otros', async () => {
    const a = await pedido()
    const b = await pedido()
    const nav = new Navegador(e.app)
    const ticket = (await nav.post('/api/realtime/ticket', { pedidoId: a.pedido.id }, { 'x-pedido-token': a.tokenSeguimiento! })).json().ticket
    const s = await conectar(ticket)
    const recibidos: { id: string }[] = []
    s.on('pedido:estado', (d: { id: string }) => recibidos.push(d))

    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    const llega = esperar<{ id: string; estado: string }>(s, 'pedido:estado')
    await cocina.patch(`/api/pedidos/${b.pedido.id}/estado`, { estado: 'en_preparacion' })
    await cocina.patch(`/api/pedidos/${a.pedido.id}/estado`, { estado: 'en_preparacion' })
    const evento = await llega
    expect(evento).toMatchObject({ id: a.pedido.id, estado: 'en_preparacion' })
    await new Promise((r) => setTimeout(r, 100))
    expect(recibidos.every((x) => x.id === a.pedido.id)).toBe(true)
  })

  it('la cocina recibe los pedidos nuevos de su sede', async () => {
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    const s = await conectar((await cocina.post('/api/realtime/ticket', {})).json().ticket)
    const llega = esperar<{ estado: string; sedeId: string }>(s, 'pedido:actualizado')
    await pedido()
    expect(await llega).toMatchObject({ estado: 'recibido', sedeId: ids.villaluz })
  })

  it('rechaza conexiones sin ticket válido', async () => {
    await expect(conectar('ticket-falso')).rejects.toThrow(/no autorizado/)
  })
})

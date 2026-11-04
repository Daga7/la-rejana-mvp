import type { PedidoCreadoDTO, PlanRutaDTO } from '@rejana/shared'
import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsSeed, levantar, Navegador, ORIGEN_WEB, type Entorno } from '../ayudas'

let e: Entorno
let ids: Awaited<ReturnType<typeof idsSeed>>
let url: string
let cocina: Navegador
let caja: Navegador
let domi: Navegador
let jhonId: string
const sockets: Socket[] = []
const SEDE = { lat: 4.68862, lng: -74.10945 }

beforeAll(async () => {
  e = await levantar()
  ids = await idsSeed(e.c)
  await e.app.listen({ port: 0, host: '127.0.0.1' })
  const dir = e.app.server.address()
  url = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`
  cocina = new Navegador(e.app)
  await cocina.ingresar('cocina.villaluz@larejana.test')
  caja = new Navegador(e.app)
  await caja.ingresar('caja.villaluz@larejana.test')
  domi = new Navegador(e.app)
  jhonId = (await domi.ingresar('domi.villaluz@larejana.test')).id
})
afterAll(async () => {
  for (const s of sockets) s.disconnect()
  await e.cerrar()
})

/** Pedido de invitado en un punto dado, ya listo y asignado a Jhon. */
async function pedidoListo(punto: { lat: number; lng: number }, asignarA: string | null = jhonId): Promise<PedidoCreadoDTO> {
  const r = await new Navegador(e.app).post('/api/pedidos', {
    sedeId: ids.villaluz,
    items: [{ productoId: ids.producto('choriperro-clasico'), cantidad: 1 }],
    contacto: { nombre: 'Cliente Ruta', telefono: '3105551234' },
    entrega: { direccion: 'Calle de prueba 1', ...punto },
    metodoPago: 'efectivo',
    aceptaPrivacidad: true,
  })
  expect(r.statusCode).toBe(201)
  const p = r.json<PedidoCreadoDTO>()
  await cocina.patch(`/api/pedidos/${p.pedido.id}/estado`, { estado: 'en_preparacion' })
  await cocina.patch(`/api/pedidos/${p.pedido.id}/estado`, { estado: 'listo' })
  if (asignarA) expect((await caja.post(`/api/pedidos/${p.pedido.id}/asignar`, { domiciliarioId: asignarA })).statusCode).toBe(200)
  return p
}

function conectar(ticket: string): Promise<Socket> {
  return new Promise((resolver, rechazar) => {
    const s = io(url, { path: '/socket.io', transports: ['websocket'], auth: { ticket }, extraHeaders: { origin: ORIGEN_WEB }, reconnection: false })
    sockets.push(s)
    s.on('connect', () => resolver(s))
    s.on('connect_error', rechazar)
  })
}

async function socketCliente(p: PedidoCreadoDTO) {
  const t = await new Navegador(e.app).post('/api/realtime/ticket', { pedidoId: p.pedido.id }, { 'x-pedido-token': p.tokenSeguimiento! })
  return conectar(t.json().ticket)
}

describe('ruta óptima', () => {
  it('ordena entregas cercanas en una sola salida dentro del límite', async () => {
    const a = await pedidoListo({ lat: SEDE.lat + 0.006, lng: SEDE.lng + 0.004 })
    const b = await pedidoListo({ lat: SEDE.lat + 0.012, lng: SEDE.lng + 0.008 })
    const plan = (await domi.post('/api/domiciliario/ruta', { pedidoIds: [b.pedido.id, a.pedido.id] })).json<PlanRutaDTO>()
    expect(plan.dividir).toBe(false)
    expect(plan.salidas).toHaveLength(1)
    // Primero la más cercana a la sede
    expect(plan.salidas[0]!.paradas.map((p) => p.pedidoId)).toEqual([a.pedido.id, b.pedido.id])
    expect(plan.salidas[0]!.cumpleLimite).toBe(true)
    expect(plan.salidas[0]!.enlaceGoogleMaps).toContain('google.com/maps/dir')
    expect(plan.mensaje).toMatch(/Ruta óptima/)
    // Se cancelan para no afectar otras pruebas
    for (const p of [a, b]) await caja.post(`/api/pedidos/${p.pedido.id}/cancelar`, { motivo: 'Prueba' })
  })

  it('sugiere dividir en dos salidas cuando juntas superarían el límite de minutos', async () => {
    const norte = await pedidoListo({ lat: SEDE.lat + 0.036, lng: SEDE.lng })
    const sur = await pedidoListo({ lat: SEDE.lat - 0.036, lng: SEDE.lng })
    const plan = (await domi.post('/api/domiciliario/ruta', { pedidoIds: [norte.pedido.id, sur.pedido.id] })).json<PlanRutaDTO>()
    expect(plan.dividir).toBe(true)
    expect(plan.salidas).toHaveLength(2)
    expect(plan.salidas.every((s) => s.cumpleLimite)).toBe(true)
    expect(plan.mensaje).toMatch(/2 salidas/)
    for (const p of [norte, sur]) await caja.post(`/api/pedidos/${p.pedido.id}/cancelar`, { motivo: 'Prueba' })
  })

  it('no deja planear pedidos ajenos ni pedidos que no están listos', async () => {
    const otroDomi = (await e.c.uow.repos.usuarios.porEmail('domi2.villaluz@larejana.test'))!.id
    const ajeno = await pedidoListo({ lat: SEDE.lat + 0.005, lng: SEDE.lng }, otroDomi)
    expect((await domi.post('/api/domiciliario/ruta', { pedidoIds: [ajeno.pedido.id] })).statusCode).toBe(403)
    await caja.post(`/api/pedidos/${ajeno.pedido.id}/cancelar`, { motivo: 'Prueba' })
    expect((await caja.post('/api/domiciliario/ruta', { pedidoIds: [ajeno.pedido.id] })).statusCode).toBe(403) // la caja no recorre
  })
})

describe('recorrido y ubicación en vivo', () => {
  it('solo el cliente del pedido en camino ve la ubicación, y deja de verla al entregarse', async () => {
    const a = await pedidoListo({ lat: SEDE.lat + 0.007, lng: SEDE.lng + 0.003 })
    const b = await pedidoListo({ lat: SEDE.lat + 0.011, lng: SEDE.lng + 0.006 })
    const ajeno = await pedidoListo({ lat: SEDE.lat + 0.004, lng: SEDE.lng + 0.002 }, null) // listo, sin recorrido

    // Sin recorrido no se acepta ubicación
    expect((await domi.post('/api/domiciliario/ubicacion', { lat: SEDE.lat, lng: SEDE.lng })).statusCode).toBe(409)

    const inicio = await domi.post('/api/domiciliario/recorridos', { pedidoIds: [a.pedido.id, b.pedido.id] })
    expect(inicio.statusCode).toBe(201)
    expect((await domi.post('/api/domiciliario/recorridos', { pedidoIds: [a.pedido.id] })).statusCode).toBe(409)
    const estados = await Promise.all([a, b].map(async (p) => (await e.c.uow.repos.pedidos.porId(p.pedido.id))!.estado))
    expect(estados).toEqual(['en_camino', 'en_camino'])
    await new Promise((r) => setTimeout(r, 100))
    expect(e.pushes.some((p) => p.n.titulo.includes('en camino'))).toBe(false) // nadie se suscribió en esta prueba

    const sA = await socketCliente(a)
    const sB = await socketCliente(b)
    const sAjeno = await socketCliente(ajeno)
    const recibidos = { a: [] as { etaMinutos: number | null }[], b: [] as unknown[], ajeno: [] as unknown[], finA: 0 }
    sA.on('pedido:ubicacion', (d: { etaMinutos: number | null }) => recibidos.a.push(d))
    sB.on('pedido:ubicacion', (d: unknown) => recibidos.b.push(d))
    sAjeno.on('pedido:ubicacion', (d: unknown) => recibidos.ajeno.push(d))
    sA.on('pedido:ubicacion-fin', () => recibidos.finA++)

    // El domiciliario envía su ubicación por WebSocket
    const ticketDomi = (await domi.post('/api/realtime/ticket', {})).json().ticket
    const sDomi = await conectar(ticketDomi)
    const enviar = (lat: number, lng: number) => new Promise<{ ok: boolean }>((r) => sDomi.emit('ubicacion', { lat, lng, precision: 10 }, r))
    expect((await enviar(SEDE.lat + 0.002, SEDE.lng + 0.001)).ok).toBe(true)
    await new Promise((r) => setTimeout(r, 150))
    expect(recibidos.a).toHaveLength(1)
    expect(recibidos.b).toHaveLength(1)
    expect(recibidos.ajeno).toHaveLength(0)
    expect(recibidos.a[0]!.etaMinutos).toBeGreaterThan(0)

    // Entrega A: A deja de recibir la ubicación; B la sigue recibiendo
    expect((await domi.post(`/api/pedidos/${a.pedido.id}/entregar`)).statusCode).toBe(200)
    e.reloj.avanzar(3_000)
    expect((await enviar(SEDE.lat + 0.008, SEDE.lng + 0.004)).ok).toBe(true)
    await new Promise((r) => setTimeout(r, 150))
    expect(recibidos.finA).toBe(1)
    expect(recibidos.a).toHaveLength(1)
    expect(recibidos.b).toHaveLength(2)

    // Última entrega: el recorrido termina solo y la última posición se borra de la BD
    const recorridoId = inicio.json().recorrido.id
    expect((await domi.post(`/api/pedidos/${b.pedido.id}/entregar`)).statusCode).toBe(200)
    const r = await e.c.uow.repos.recorridos.porId(recorridoId)
    expect(r).toMatchObject({ estado: 'finalizado', ultimaLat: null, ultimaLng: null })
    expect((await domi.post('/api/domiciliario/ubicacion', { lat: SEDE.lat, lng: SEDE.lng })).statusCode).toBe(409)
    await caja.post(`/api/pedidos/${ajeno.pedido.id}/cancelar`, { motivo: 'Prueba' })
  })

  it('un cliente o la caja no pueden enviar ubicaciones', async () => {
    const cliente = new Navegador(e.app)
    await cliente.ingresar('cliente@larejana.test')
    expect((await cliente.post('/api/domiciliario/ubicacion', { lat: SEDE.lat, lng: SEDE.lng })).statusCode).toBe(403)
    expect((await caja.post('/api/domiciliario/ubicacion', { lat: SEDE.lat, lng: SEDE.lng })).statusCode).toBe(403)
  })
})

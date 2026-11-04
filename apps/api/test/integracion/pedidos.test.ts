import type { PedidoCreadoDTO, PedidoDTO } from '@rejana/shared'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { idsSeed, levantar, Navegador, type Entorno } from '../ayudas'

let e: Entorno
let ids: Awaited<ReturnType<typeof idsSeed>>
let admin: Navegador

beforeAll(async () => {
  e = await levantar()
  ids = await idsSeed(e.c)
  admin = new Navegador(e.app)
  await admin.ingresar('admin@larejana.test')
})
afterAll(async () => {
  await e.cerrar()
})
beforeEach(() => {
  e.pushes.length = 0
})

// Coordenadas cerca de cada sede (dentro de la cobertura)
const CERCA_VILLALUZ = { lat: 4.6921, lng: -74.1052 }
const CERCA_NORMANDIA = { lat: 4.6741, lng: -74.1031 }

function cuerpoPedido(sedeId: string, items: { slug: string; cantidad: number; notas?: string }[], extra: Record<string, unknown> = {}) {
  const punto = sedeId === ids.villaluz ? CERCA_VILLALUZ : CERCA_NORMANDIA
  return {
    sedeId,
    items: items.map((i) => ({ productoId: ids.producto(i.slug), cantidad: i.cantidad, notas: i.notas })),
    contacto: { nombre: 'Juana Invitada', telefono: '310 555 1234' },
    entrega: { direccion: 'Calle 70 # 79-10', detalle: 'Casa 4', barrio: 'Villaluz', ...punto },
    metodoPago: 'efectivo',
    pagaCon: 200000,
    aceptaPrivacidad: true,
    ...extra,
  }
}

async function stock(sedeId: string) {
  return e.c.uow.repos.inventario.stock(sedeId)
}

async function fijar(sedeId: string, insumo: string, cantidad: number) {
  const r = await admin.post('/api/admin/inventario/movimientos', { sedeId, insumoId: ids.insumo(insumo), modo: 'fijar', cantidad })
  expect(r.statusCode).toBe(200)
}

async function pedirComoInvitado(cuerpo: unknown, nav = new Navegador(e.app), cabeceras: Record<string, string> = {}) {
  const r = await nav.post('/api/pedidos', cuerpo, cabeceras)
  return { r, datos: r.json<PedidoCreadoDTO>(), nav }
}

describe('crear pedido: precios, cobertura y descuento de inventario por receta', () => {
  it('un invitado pide; el total usa los precios del servidor y se descuentan los insumos exactos', async () => {
    const antes = await stock(ids.villaluz)
    const { r, datos } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-rejana', cantidad: 2 }, { slug: 'choriperro-clasico', cantidad: 1, notas: 'sin piña' }]))
    expect(r.statusCode).toBe(201)
    expect(datos.tokenSeguimiento).toMatch(/^[\w-]{40,}$/)
    expect(datos.pedido).toMatchObject({ estado: 'recibido', subtotal: 2 * 32000 + 15000, costoEnvio: 5000, total: 84000, esInvitado: true })

    const despues = await stock(ids.villaluz)
    const recetas = await e.c.uow.repos.catalogo.recetas([ids.producto('la-rejana'), ids.producto('choriperro-clasico')])
    const esperado = new Map<string, number>()
    for (const l of recetas.get(ids.producto('la-rejana'))!) esperado.set(l.insumoId, (esperado.get(l.insumoId) ?? 0) + l.cantidad * 2)
    for (const l of recetas.get(ids.producto('choriperro-clasico'))!) esperado.set(l.insumoId, (esperado.get(l.insumoId) ?? 0) + l.cantidad)
    for (const [insumoId, consumo] of esperado) expect(antes.get(insumoId)! - despues.get(insumoId)!).toBeCloseTo(consumo, 3)
    // Los insumos que no están en ninguna receta no cambian
    expect(despues.get(ids.insumo('Huevo de codorniz'))).toBe(antes.get(ids.insumo('Huevo de codorniz')))

    const movs = await e.c.uow.repos.inventario.movimientosDePedido(datos.pedido.id)
    expect(movs.every((m) => m.tipo === 'consumo_pedido' && m.cantidad < 0)).toBe(true)
    expect(movs).toHaveLength(esperado.size)
  })

  it('el invitado debe autorizar el tratamiento de datos', async () => {
    const { r } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }], { aceptaPrivacidad: false }))
    expect(r.statusCode).toBe(422)
  })

  it('rechaza direcciones fuera de la cobertura de la sede', async () => {
    const cuerpo = cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }])
    cuerpo.entrega = { ...cuerpo.entrega, lat: 4.6097, lng: -74.0817 } // centro de Bogotá, a más de 5 km
    const { r } = await pedirComoInvitado(cuerpo)
    expect(r.statusCode).toBe(422)
    expect(r.json().error.codigo).toBe('FUERA_DE_COBERTURA')
  })

  it('no vende un producto que la sede no tiene en su menú', async () => {
    const { r } = await pedirComoInvitado(cuerpoPedido(ids.normandia, [{ slug: 'choriperro-ranchero', cantidad: 1 }]))
    expect(r.statusCode).toBe(409)
    expect(r.json().error.codigo).toBe('PRODUCTO_NO_DISPONIBLE')
  })

  it('si no alcanza el inventario rechaza el pedido completo y no descuenta nada', async () => {
    await fijar(ids.villaluz, 'Pan brioche', 3)
    const antes = await stock(ids.villaluz)
    const { r } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-rejana', cantidad: 2 }, { slug: 'la-callejera', cantidad: 2 }]))
    expect(r.statusCode).toBe(409)
    expect(r.json().error.codigo).toBe('STOCK_INSUFICIENTE')
    expect(r.json().error.detalles.productos.map((p: { nombre: string }) => p.nombre).sort()).toEqual(['La Callejera', 'La Rejana'])
    expect(await stock(ids.villaluz)).toEqual(antes)
    await fijar(ids.villaluz, 'Pan brioche', 40)
  })

  it('pedidos simultáneos no sobrevenden: el inventario nunca queda negativo', async () => {
    await fijar(ids.villaluz, 'Pan brioche', 5)
    const intentos = await Promise.all(Array.from({ length: 4 }, () => pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 2 }]))))
    const exitos = intentos.filter((x) => x.r.statusCode === 201)
    const rechazos = intentos.filter((x) => x.r.statusCode === 409)
    expect(exitos).toHaveLength(2)
    expect(rechazos).toHaveLength(2)
    expect((await stock(ids.villaluz)).get(ids.insumo('Pan brioche'))).toBe(1)
    await fijar(ids.villaluz, 'Pan brioche', 40)
  })

  it('es idempotente: reintentar el mismo checkout no duplica el pedido ni el descuento', async () => {
    const clave = randomUUID()
    const nav = new Navegador(e.app)
    const cuerpo = cuerpoPedido(ids.normandia, [{ slug: 'choriperro-clasico', cantidad: 1 }])
    const primero = await pedirComoInvitado(cuerpo, nav, { 'idempotency-key': clave })
    const despuesPrimero = await stock(ids.normandia)
    const segundo = await pedirComoInvitado(cuerpo, nav, { 'idempotency-key': clave })
    expect(segundo.r.statusCode).toBe(201)
    expect(segundo.datos.pedido.id).toBe(primero.datos.pedido.id)
    expect(await stock(ids.normandia)).toEqual(despuesPrimero)
    // El token nuevo también sirve para seguir el pedido
    const ver = await new Navegador(e.app).get(`/api/pedidos/${primero.datos.pedido.id}`, { 'x-pedido-token': segundo.datos.tokenSeguimiento! })
    expect(ver.statusCode).toBe(200)
  })
})

describe('acceso al pedido', () => {
  it('el invitado lo ve con su token; sin token o con otro token, "no existe"', async () => {
    const a = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }]))
    const b = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }]))
    const extrano = new Navegador(e.app)
    expect((await extrano.get(`/api/pedidos/${a.datos.pedido.id}`, { 'x-pedido-token': a.datos.tokenSeguimiento! })).statusCode).toBe(200)
    expect((await extrano.get(`/api/pedidos/${a.datos.pedido.id}`)).statusCode).toBe(404)
    expect((await extrano.get(`/api/pedidos/${a.datos.pedido.id}`, { 'x-pedido-token': b.datos.tokenSeguimiento! })).statusCode).toBe(404)
  })

  it('un cliente registrado ve sus pedidos y no los de otros', async () => {
    const cliente = new Navegador(e.app)
    await cliente.ingresar('cliente@larejana.test')
    const r = await cliente.post('/api/pedidos', cuerpoPedido(ids.villaluz, [{ slug: 'la-parchada', cantidad: 1 }], { aceptaPrivacidad: undefined, guardarDireccion: true }))
    expect(r.statusCode).toBe(201)
    expect(r.json().tokenSeguimiento).toBeNull()
    const pedidoId = r.json().pedido.id
    expect((await cliente.get('/api/mis-pedidos')).json().pedidos.some((p: PedidoDTO) => p.id === pedidoId)).toBe(true)
    const otro = new Navegador(e.app)
    await otro.ingresar('domi.normandia@larejana.test')
    expect((await otro.get(`/api/pedidos/${pedidoId}`)).statusCode).toBe(404)
  })
})

describe('estados, permisos por rol y sede, y notificaciones', () => {
  it('flujo completo: cocina → caja → domiciliario, con push en cada cambio', async () => {
    const { datos } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }]))
    const id = datos.pedido.id
    // El invitado activa las notificaciones de su pedido
    const sus = await new Navegador(e.app).post('/api/push/suscripciones', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'BOr6x-clave-publica-de-prueba', auth: 'auth-prueba' }, pedidoId: id }, { 'x-pedido-token': datos.tokenSeguimiento! })
    expect(sus.statusCode).toBe(204)

    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    const cocinaOtra = new Navegador(e.app)
    await cocinaOtra.ingresar('cocina.normandia@larejana.test')
    expect((await cocinaOtra.patch(`/api/pedidos/${id}/estado`, { estado: 'en_preparacion' })).statusCode).toBe(403) // otra sede
    expect((await cocina.patch(`/api/pedidos/${id}/estado`, { estado: 'listo' })).statusCode).toBe(409) // no se salta estados
    expect((await cocina.patch(`/api/pedidos/${id}/estado`, { estado: 'en_preparacion' })).statusCode).toBe(200)
    expect((await cocina.patch(`/api/pedidos/${id}/estado`, { estado: 'listo' })).statusCode).toBe(200)
    expect((await cocina.patch(`/api/pedidos/${id}/estado`, { estado: 'en_camino' })).statusCode).toBe(403) // cocina no despacha

    const caja = new Navegador(e.app)
    await caja.ingresar('caja.villaluz@larejana.test')
    expect((await caja.patch(`/api/pedidos/${id}/estado`, { estado: 'en_camino' })).statusCode).toBe(422) // falta domiciliario
    const doms = (await caja.get(`/api/operacion/domiciliarios?sedeId=${ids.villaluz}`)).json().domiciliarios
    const jhon = doms.find((x: { nombre: string }) => x.nombre.startsWith('Jhon'))
    const brayan = doms.find((x: { nombre: string }) => x.nombre.startsWith('Brayan'))
    expect((await caja.post(`/api/pedidos/${id}/asignar`, { domiciliarioId: jhon.id })).statusCode).toBe(200)
    expect((await caja.patch(`/api/pedidos/${id}/estado`, { estado: 'en_camino' })).statusCode).toBe(200)

    const otroDomi = new Navegador(e.app)
    await otroDomi.ingresar('domi2.villaluz@larejana.test')
    expect((await otroDomi.patch(`/api/pedidos/${id}/estado`, { estado: 'entregado' })).statusCode).toBe(403)
    void brayan
    const domi = new Navegador(e.app)
    await domi.ingresar('domi.villaluz@larejana.test')
    const fin = await domi.patch(`/api/pedidos/${id}/estado`, { estado: 'entregado' })
    expect(fin.statusCode).toBe(200)
    expect(fin.json().pedido.eventos.map((x: { estado: string }) => x.estado)).toEqual(['recibido', 'en_preparacion', 'listo', 'listo', 'en_camino', 'entregado'])

    await new Promise((r) => setTimeout(r, 100))
    const titulos = e.pushes.filter((p) => p.endpoint.includes('abc123')).map((p) => p.n.titulo)
    expect(titulos).toEqual(expect.arrayContaining(['Tu pedido está en la parrilla 🔥', 'Tu pedido está listo', '¡Tu pedido está en camino! 🛵', '¡Buen provecho! 🍔']))
  })

  it('no acepta suscripciones push hacia servidores arbitrarios (SSRF)', async () => {
    const { datos } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }]))
    const r = await new Navegador(e.app).post('/api/push/suscripciones', { endpoint: 'https://169.254.169.254/latest/meta-data', keys: { p256dh: 'BOr6x-clave-publica-de-prueba', auth: 'auth-prueba' }, pedidoId: datos.pedido.id }, { 'x-pedido-token': datos.tokenSeguimiento! })
    expect(r.statusCode).toBe(422)
  })

  it('el cliente cancela mientras está "recibido" y el inventario vuelve exacto', async () => {
    const antes = await stock(ids.villaluz)
    const { datos, nav } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-rejana', cantidad: 1 }]))
    const r = await nav.post(`/api/pedidos/${datos.pedido.id}/cancelar`, { motivo: 'Me equivoqué de dirección' }, { 'x-pedido-token': datos.tokenSeguimiento! })
    expect(r.statusCode).toBe(200)
    expect(r.json().pedido.estado).toBe('cancelado')
    expect(await stock(ids.villaluz)).toEqual(antes)
    const otraVez = await nav.post(`/api/pedidos/${datos.pedido.id}/cancelar`, { motivo: 'Otra vez' }, { 'x-pedido-token': datos.tokenSeguimiento! })
    expect(otraVez.statusCode).toBe(409)
  })

  it('el cliente no puede cancelar cuando la cocina ya empezó', async () => {
    const { datos, nav } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }]))
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    await cocina.patch(`/api/pedidos/${datos.pedido.id}/estado`, { estado: 'en_preparacion' })
    const r = await nav.post(`/api/pedidos/${datos.pedido.id}/cancelar`, { motivo: 'Ya no quiero' }, { 'x-pedido-token': datos.tokenSeguimiento! })
    expect(r.statusCode).toBe(409)
  })

  it('si la caja cancela un pedido ya listo, por defecto no repone (la comida se hizo), salvo que lo indique', async () => {
    const caja = new Navegador(e.app)
    await caja.ingresar('caja.villaluz@larejana.test')
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    const preparar = async () => {
      const { datos } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }]))
      await cocina.patch(`/api/pedidos/${datos.pedido.id}/estado`, { estado: 'en_preparacion' })
      await cocina.patch(`/api/pedidos/${datos.pedido.id}/estado`, { estado: 'listo' })
      return datos.pedido.id
    }
    const sinReponer = await preparar()
    const antes1 = await stock(ids.villaluz)
    await caja.post(`/api/pedidos/${sinReponer}/cancelar`, { motivo: 'El cliente no contestó' })
    expect(await stock(ids.villaluz)).toEqual(antes1)

    const conReponer = await preparar()
    const antes2 = await stock(ids.villaluz)
    await caja.post(`/api/pedidos/${conReponer}/cancelar`, { motivo: 'Error de cocina', reponerInventario: true })
    expect((await stock(ids.villaluz)).get(ids.insumo('Pan brioche'))).toBe(antes2.get(ids.insumo('Pan brioche'))! + 1)
  })

  it('caja cobra (con cambio) y cierra solo pedidos entregados y pagados', async () => {
    const { datos } = await pedirComoInvitado(cuerpoPedido(ids.normandia, [{ slug: 'choriperro-clasico', cantidad: 2 }]))
    const id = datos.pedido.id
    const caja = new Navegador(e.app)
    await caja.ingresar('caja.normandia@larejana.test')
    expect((await caja.post(`/api/pedidos/${id}/cerrar`)).statusCode).toBe(422)
    const pago = await caja.post(`/api/pedidos/${id}/pagos`, { metodo: 'efectivo', monto: datos.pedido.total, recibido: 50000 })
    expect(pago.json().pedido.estadoPago).toBe('pagado')
    expect((await caja.get(`/api/pedidos/${id}/pagos`)).json().pagos[0]).toMatchObject({ recibido: 50000, cambio: 50000 - datos.pedido.total })
    // Avanza hasta entregado
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.normandia@larejana.test')
    await cocina.patch(`/api/pedidos/${id}/estado`, { estado: 'en_preparacion' })
    await cocina.patch(`/api/pedidos/${id}/estado`, { estado: 'listo' })
    const dom = (await caja.get(`/api/operacion/domiciliarios?sedeId=${ids.normandia}`)).json().domiciliarios[0]
    await caja.post(`/api/pedidos/${id}/asignar`, { domiciliarioId: dom.id })
    await caja.patch(`/api/pedidos/${id}/estado`, { estado: 'en_camino' })
    await caja.patch(`/api/pedidos/${id}/estado`, { estado: 'entregado' })
    const cierre = await caja.post(`/api/pedidos/${id}/cerrar`)
    expect(cierre.statusCode).toBe(200)
    expect(cierre.json().pedido.cerradoEn).not.toBeNull()
    // La caja de otra sede no puede cobrar pedidos ajenos
    const cajaOtra = new Navegador(e.app)
    await cajaOtra.ingresar('caja.villaluz@larejana.test')
    expect((await cajaOtra.get(`/api/pedidos/${id}/pagos`)).statusCode).toBe(403)
  })

  it('el tablero de operación solo muestra la sede propia', async () => {
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    const r = await cocina.get(`/api/operacion/pedidos?sedeId=${ids.villaluz}&estados=recibido,en_preparacion,listo`)
    expect(r.statusCode).toBe(200)
    expect(r.json().pedidos.every((p: PedidoDTO) => p.sedeId === ids.villaluz && ['recibido', 'en_preparacion', 'listo'].includes(p.estado))).toBe(true)
    expect((await cocina.get(`/api/operacion/pedidos?sedeId=${ids.normandia}`)).statusCode).toBe(403)
    const domi = new Navegador(e.app)
    await domi.ingresar('domi.villaluz@larejana.test')
    expect((await domi.get(`/api/operacion/pedidos?sedeId=${ids.villaluz}`)).statusCode).toBe(403)
  })

  it('tickets de tiempo real: el invitado solo obtiene la sala de su pedido', async () => {
    const { datos } = await pedirComoInvitado(cuerpoPedido(ids.villaluz, [{ slug: 'la-callejera', cantidad: 1 }]))
    const nav = new Navegador(e.app)
    expect((await nav.post('/api/realtime/ticket', { pedidoId: datos.pedido.id })).statusCode).toBe(404)
    const ok = await nav.post('/api/realtime/ticket', { pedidoId: datos.pedido.id }, { 'x-pedido-token': datos.tokenSeguimiento! })
    expect(ok.statusCode).toBe(200)
    const claims = await e.c.tokens.verificarTicket(ok.json().ticket)
    expect(claims.salas).toEqual([`pedido:${datos.pedido.id}`])
    expect((await nav.post('/api/realtime/ticket', {})).statusCode).toBe(403)
  })
})

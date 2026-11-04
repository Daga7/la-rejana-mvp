import type { CuentaMesaDTO, PedidoDTO, PedidoMesaDTO, SalonDTO } from '@rejana/shared'
import { randomUUID } from 'node:crypto'
import { io, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsSeed, levantar, Navegador, ORIGEN_WEB, type Entorno } from '../ayudas'

let e: Entorno
let ids: Awaited<ReturnType<typeof idsSeed>>
let url: string
let admin: Navegador
let mesero: Navegador
let cocina: Navegador
let caja: Navegador
const sockets: Socket[] = []

beforeAll(async () => {
  e = await levantar()
  ids = await idsSeed(e.c)
  await e.app.listen({ port: 0, host: '127.0.0.1' })
  const dir = e.app.server.address()
  url = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`
  admin = new Navegador(e.app)
  await admin.ingresar('admin@larejana.test')
  mesero = new Navegador(e.app)
  await mesero.ingresar('mesero.villaluz@larejana.test')
  cocina = new Navegador(e.app)
  await cocina.ingresar('cocina.villaluz@larejana.test')
  caja = new Navegador(e.app)
  await caja.ingresar('caja.villaluz@larejana.test')
})
afterAll(async () => {
  for (const s of sockets) s.disconnect()
  await e.cerrar()
})

const mesaId = async (sedeId: string, numero: number) => (await e.c.uow.repos.mesas.mesas(sedeId)).find((m) => m.numero === numero)!.id
const stock = (sedeId: string) => e.c.uow.repos.inventario.stock(sedeId)

async function abrir(numero: number, comensales = 2, nav = mesero, sedeId = ids.villaluz): Promise<CuentaMesaDTO> {
  const r = await nav.post(`/api/mesas/${sedeId}/cuentas`, { mesaId: await mesaId(sedeId, numero), comensales })
  expect(r.statusCode).toBe(201)
  return r.json<{ cuenta: CuentaMesaDTO }>().cuenta
}

async function ronda(cuentaId: string, items: { slug: string; cantidad: number; notas?: string }[], cabeceras: Record<string, string> = {}, nav = mesero) {
  const r = await nav.post(`/api/cuentas/${cuentaId}/rondas`, { items: items.map((i) => ({ productoId: ids.producto(i.slug), cantidad: i.cantidad, notas: i.notas })) }, cabeceras)
  return { r, pedido: r.statusCode === 201 ? r.json<{ pedido: PedidoMesaDTO }>().pedido : null }
}

async function mover(pedidoId: string, estado: string, nav: Navegador) {
  const r = await nav.patch(`/api/pedidos/${pedidoId}/estado`, { estado })
  return r
}

/** Lleva una ronda de la cocina hasta servida. */
async function servir(pedidoId: string) {
  expect((await mover(pedidoId, 'en_preparacion', cocina)).statusCode).toBe(200)
  expect((await mover(pedidoId, 'listo', cocina)).statusCode).toBe(200)
  expect((await mover(pedidoId, 'entregado', mesero)).statusCode).toBe(200)
}

async function consumoEsperado(items: { slug: string; cantidad: number }[]) {
  const recetas = await e.c.uow.repos.catalogo.recetas(items.map((i) => ids.producto(i.slug)))
  const esperado = new Map<string, number>()
  for (const i of items) for (const l of recetas.get(ids.producto(i.slug))!) esperado.set(l.insumoId, (esperado.get(l.insumoId) ?? 0) + l.cantidad * i.cantidad)
  return esperado
}

describe('mesero: abrir mesa, rondas a la cocina y servir', () => {
  it('el flujo completo: ronda con descuento exacto por receta, cocina, servir, pedir la cuenta y cobrar dividido con propina', async () => {
    const cuenta = await abrir(1, 3)
    expect(cuenta).toMatchObject({ mesaNumero: 1, comensales: 3, estado: 'abierta', subtotal: 0, meseroNombre: 'Valentina Ruiz' })

    // Ronda 1: descuenta los insumos exactos de las recetas
    const antes = await stock(ids.villaluz)
    const items1 = [{ slug: 'la-rejana', cantidad: 2 }, { slug: 'choriperro-clasico', cantidad: 1 }]
    const { r, pedido: r1 } = await ronda(cuenta.id, [...items1.slice(0, 1), { ...items1[1]!, notas: 'sin piña' }])
    expect(r.statusCode).toBe(201)
    expect(r1).toMatchObject({ canal: 'mesa', estado: 'recibido', costoEnvio: 0, subtotal: 2 * 32000 + 15000, total: 79000, mesa: { numero: 1, ronda: 1, cuentaId: cuenta.id } })
    const despues = await stock(ids.villaluz)
    for (const [insumoId, consumo] of await consumoEsperado(items1)) expect(antes.get(insumoId)! - despues.get(insumoId)!).toBeCloseTo(consumo, 3)
    const movs = await e.c.uow.repos.inventario.movimientosDePedido(r1!.id)
    expect(movs.every((m) => m.tipo === 'consumo_pedido' && m.cantidad < 0)).toBe(true)

    // La cocina la ve en su tablero, con la mesa
    const tablero = (await cocina.get(`/api/operacion/pedidos?sedeId=${ids.villaluz}&estados=recibido`)).json<{ pedidos: PedidoDTO[] }>().pedidos
    expect(tablero.find((p) => p.id === r1!.id)).toMatchObject({ canal: 'mesa', mesa: { numero: 1, ronda: 1 } })

    // Ronda 2 (siguen pidiendo)
    const { pedido: r2 } = await ronda(cuenta.id, [{ slug: 'la-callejera', cantidad: 1 }])
    expect(r2!.mesa.ronda).toBe(2)

    // El mesero no cocina; la cocina no sirve
    expect((await mover(r1!.id, 'en_preparacion', mesero)).statusCode).toBe(403)
    expect((await mover(r1!.id, 'en_preparacion', cocina)).statusCode).toBe(200)
    expect((await mover(r1!.id, 'listo', cocina)).statusCode).toBe(200)
    expect((await mover(r1!.id, 'entregado', cocina)).statusCode).toBe(403)
    // En la mesa no existe "en camino"
    expect((await mover(r1!.id, 'en_camino', caja)).statusCode).toBe(409)

    // El salón muestra la mesa con algo listo para servir
    const salon = (await mesero.get(`/api/mesas/${ids.villaluz}/salon`)).json<{ salon: SalonDTO }>().salon
    expect(salon.mesas.find((m) => m.numero === 1)).toMatchObject({ estado: 'para_servir', cuenta: { paraServir: 1, enCocina: 1, rondas: 2, subtotal: 79000 + 22000 } })
    expect(salon.paraServir.map((p) => p.id)).toContain(r1!.id)

    expect((await mover(r1!.id, 'entregado', mesero)).statusCode).toBe(200)
    // No se puede cobrar con una ronda todavía en la cocina
    const temprano = await caja.post(`/api/cuentas/${cuenta.id}/cobrar`, { pagos: [{ metodo: 'efectivo', monto: 101000 }], propina: 0 })
    expect(temprano.statusCode).toBe(422)
    expect(temprano.json().error.mensaje).toMatch(/sin servir/)
    await servir(r2!.id)

    // Pedir la cuenta: la caja la ve por cobrar
    const pedida = (await mesero.patch(`/api/cuentas/${cuenta.id}`, { cuentaPedida: true })).json<{ cuenta: CuentaMesaDTO }>().cuenta
    expect(pedida.cuentaPedidaEn).not.toBeNull()
    const enCaja = (await caja.get(`/api/mesas/${ids.villaluz}/salon`)).json<{ salon: SalonDTO }>().salon
    expect(enCaja.mesas.find((m) => m.numero === 1)!.estado).toBe('por_cobrar')

    // El mesero no cobra
    expect((await mesero.post(`/api/cuentas/${cuenta.id}/cobrar`, { pagos: [{ metodo: 'efectivo', monto: 101000 }] })).statusCode).toBe(403)
    // Los pagos deben sumar consumo + propina
    const mal = await caja.post(`/api/cuentas/${cuenta.id}/cobrar`, { pagos: [{ metodo: 'efectivo', monto: 50000 }], propina: 10000 })
    expect(mal.statusCode).toBe(422)

    // Cuenta dividida: QR + efectivo con cambio, y propina voluntaria del 10 %
    const cobro = await caja.post(`/api/cuentas/${cuenta.id}/cobrar`, {
      pagos: [
        { metodo: 'qr', monto: 60000, referencia: 'Nequi 1234' },
        { metodo: 'efectivo', monto: 51100, recibido: 60000 },
      ],
      propina: 10100,
    })
    expect(cobro.statusCode).toBe(200)
    const cerrada = cobro.json<{ cuenta: CuentaMesaDTO }>().cuenta
    expect(cerrada).toMatchObject({ estado: 'cerrada', estadoPago: 'pagado', subtotal: 101000, propina: 10100 })
    expect(cerrada.pagos.find((p) => p.metodo === 'efectivo')).toMatchObject({ recibido: 60000, cambio: 8900 })
    expect(cerrada.rondas.every((x) => x.estadoPago === 'pagado' && x.cerradoEn !== null)).toBe(true)

    // Cobrada: la mesa queda libre y no se puede volver a cobrar ni agregar rondas
    const libre = (await mesero.get(`/api/mesas/${ids.villaluz}/salon`)).json<{ salon: SalonDTO }>().salon
    expect(libre.mesas.find((m) => m.numero === 1)).toMatchObject({ estado: 'libre', cuenta: null })
    expect((await caja.post(`/api/cuentas/${cuenta.id}/cobrar`, { pagos: [{ metodo: 'efectivo', monto: 1 }] })).statusCode).toBe(409)
    expect((await ronda(cuenta.id, [{ slug: 'la-callejera', cantidad: 1 }])).r.statusCode).toBe(409)
  })

  it('dos meseros que abren la misma mesa quedan en la misma cuenta', async () => {
    const admin2 = await abrir(2, 2, admin)
    const otra = await abrir(2, 4)
    expect(otra.id).toBe(admin2.id)
    const [a, b] = await Promise.all([abrir(3), abrir(3)])
    expect(a.id).toBe(b.id)
  })

  it('una ronda repetida con la misma clave de idempotencia no se duplica (mala señal)', async () => {
    const cuenta = await abrir(4)
    const clave = randomUUID()
    const [x, y] = await Promise.all([
      ronda(cuenta.id, [{ slug: 'la-parchada', cantidad: 1 }], { 'idempotency-key': clave }),
      ronda(cuenta.id, [{ slug: 'la-parchada', cantidad: 1 }], { 'idempotency-key': clave }),
    ])
    expect([x.r.statusCode, y.r.statusCode]).toEqual([201, 201])
    expect(x.pedido!.id).toBe(y.pedido!.id)
    const detalle = (await mesero.get(`/api/cuentas/${cuenta.id}`)).json<{ cuenta: CuentaMesaDTO }>().cuenta
    expect(detalle.rondas).toHaveLength(1)
    // La misma clave no sirve para otra cuenta
    const otra = await abrir(5)
    expect((await ronda(otra.id, [{ slug: 'la-parchada', cantidad: 1 }], { 'idempotency-key': clave })).r.statusCode).toBe(409)
  })

  it('sin insumos suficientes la ronda no sale y el inventario no cambia', async () => {
    const cuenta = await abrir(6)
    expect((await admin.post('/api/admin/inventario/movimientos', { sedeId: ids.villaluz, insumoId: ids.insumo('Pan brioche'), modo: 'fijar', cantidad: 1 })).statusCode).toBe(200)
    const antes = await stock(ids.villaluz)
    const { r } = await ronda(cuenta.id, [{ slug: 'la-rejana', cantidad: 2 }])
    expect(r.statusCode).toBe(409)
    expect(r.json().error.codigo).toBe('STOCK_INSUFICIENTE')
    expect(await stock(ids.villaluz)).toEqual(antes)
    expect((await admin.post('/api/admin/inventario/movimientos', { sedeId: ids.villaluz, insumoId: ids.insumo('Pan brioche'), modo: 'fijar', cantidad: 300 })).statusCode).toBe(200)
  })

  it('el mesero corrige una ronda en cola (los insumos vuelven) pero no una que ya está en la parrilla', async () => {
    const cuenta = await abrir(7)
    const antes = await stock(ids.villaluz)
    const { pedido: r1 } = await ronda(cuenta.id, [{ slug: 'choriperro-rejano', cantidad: 2 }])
    expect((await mesero.post(`/api/pedidos/${r1!.id}/cancelar`, { motivo: 'Me equivoqué de mesa' })).statusCode).toBe(200)
    expect(await stock(ids.villaluz)).toEqual(antes)

    const { pedido: r2 } = await ronda(cuenta.id, [{ slug: 'choriperro-rejano', cantidad: 1 }])
    expect((await mover(r2!.id, 'en_preparacion', cocina)).statusCode).toBe(200)
    const tarde = await mesero.post(`/api/pedidos/${r2!.id}/cancelar`, { motivo: 'Ya no lo quieren' })
    expect(tarde.statusCode).toBe(409)
    expect(tarde.json().error.mensaje).toMatch(/caja/)
    // La caja sí puede (y decide si repone)
    expect((await caja.post(`/api/pedidos/${r2!.id}/cancelar`, { motivo: 'Cliente se fue', reponerInventario: false })).statusCode).toBe(200)
    // Con todo cancelado, la mesa se puede liberar sin cobrar
    const liberada = await mesero.post(`/api/cuentas/${cuenta.id}/liberar`)
    expect(liberada.statusCode).toBe(200)
    expect(liberada.json<{ cuenta: CuentaMesaDTO }>().cuenta.estado).toBe('cancelada')
  })

  it('no se libera una mesa con consumo, ni se pide la cuenta de una mesa vacía', async () => {
    const cuenta = await abrir(8)
    expect((await mesero.patch(`/api/cuentas/${cuenta.id}`, { cuentaPedida: true })).statusCode).toBe(422)
    await ronda(cuenta.id, [{ slug: 'la-callejera', cantidad: 1 }])
    const r = await mesero.post(`/api/cuentas/${cuenta.id}/liberar`)
    expect(r.statusCode).toBe(422)
    expect(r.json().error.mensaje).toMatch(/caja/)
    // Si siguen pidiendo después de pedir la cuenta, vuelve a quedar abierta para la caja
    expect((await mesero.patch(`/api/cuentas/${cuenta.id}`, { cuentaPedida: true, comensales: 5 })).statusCode).toBe(200)
    await ronda(cuenta.id, [{ slug: 'choriperro-clasico', cantidad: 1 }])
    const detalle = (await mesero.get(`/api/cuentas/${cuenta.id}`)).json<{ cuenta: CuentaMesaDTO }>().cuenta
    expect(detalle).toMatchObject({ comensales: 5, cuentaPedidaEn: null })
  })

  it('las ventas cuentan la mesa como un solo pedido aunque tenga varias rondas', async () => {
    const hoy = () => e.c.uow.repos.reportes.ventasPorDia({ sedeId: ids.villaluz, desde: new Date(Date.now() - 86_400_000), hasta: new Date(Date.now() + 86_400_000) })
    const suma = (f: Awaited<ReturnType<typeof hoy>>) => f.reduce((a, x) => ({ pedidos: a.pedidos + x.pedidos, ventas: a.ventas + x.ventas }), { pedidos: 0, ventas: 0 })
    const antes = suma(await hoy())
    const cuenta = await abrir(9)
    const { pedido: a } = await ronda(cuenta.id, [{ slug: 'la-rejana', cantidad: 1 }])
    const { pedido: b } = await ronda(cuenta.id, [{ slug: 'la-callejera', cantidad: 1 }])
    const despues = suma(await hoy())
    expect(despues.pedidos - antes.pedidos).toBe(1)
    expect(despues.ventas - antes.ventas).toBe(a!.total + b!.total)
  })
})

describe('mesas: permisos por rol y sede', () => {
  it('el mesero solo opera el salón de su sede y nunca ve domicilios', async () => {
    const otraSede = await mesero.post(`/api/mesas/${ids.normandia}/cuentas`, { mesaId: await mesaId(ids.normandia, 1), comensales: 2 })
    expect(otraSede.statusCode).toBe(403)
    expect((await mesero.get(`/api/mesas/${ids.normandia}/salon`)).statusCode).toBe(403)
    // Una mesa de otra sede no se abre "por la puerta de atrás" con la sede propia
    const cruzada = await mesero.post(`/api/mesas/${ids.villaluz}/cuentas`, { mesaId: await mesaId(ids.normandia, 1), comensales: 2 })
    expect(cruzada.statusCode).toBe(404)
    // Ni tablero de domicilios, ni pedidos de clientes
    expect((await mesero.get(`/api/operacion/pedidos?sedeId=${ids.villaluz}`)).statusCode).toBe(403)
    const cuentaNormandia = await abrir(1, 2, admin, ids.normandia)
    expect((await mesero.get(`/api/cuentas/${cuentaNormandia.id}`)).statusCode).toBe(403)
    expect((await ronda(cuentaNormandia.id, [{ slug: 'la-rejana', cantidad: 1 }])).r.statusCode).toBe(403)
  })

  it('cocina, domiciliario y cliente no atienden mesas; solo el admin administra las mesas', async () => {
    const mesa = await mesaId(ids.villaluz, 10)
    for (const correo of ['cocina.villaluz@larejana.test', 'domi.villaluz@larejana.test', 'cliente@larejana.test']) {
      const n = new Navegador(e.app)
      await n.ingresar(correo)
      expect((await n.post(`/api/mesas/${ids.villaluz}/cuentas`, { mesaId: mesa, comensales: 2 })).statusCode).toBe(403)
    }
    expect((await new Navegador(e.app).get(`/api/mesas/${ids.villaluz}/salon`)).statusCode).toBe(401)
    expect((await mesero.post(`/api/admin/sedes/${ids.villaluz}/mesas`, { numero: 50, puestos: 4, activa: true })).statusCode).toBe(403)
    expect((await caja.get(`/api/admin/sedes/${ids.villaluz}/mesas`)).statusCode).toBe(403)
  })

  it('el admin crea y edita mesas; no repite números ni saca de servicio una mesa ocupada', async () => {
    const r = await admin.post(`/api/admin/sedes/${ids.normandia}/mesas`, { numero: 20, zona: 'Patio', puestos: 6, activa: true })
    expect(r.statusCode).toBe(201)
    const nueva = r.json().mesa
    expect((await admin.post(`/api/admin/sedes/${ids.normandia}/mesas`, { numero: 20, puestos: 4, activa: true })).statusCode).toBe(409)
    expect((await admin.put(`/api/admin/mesas/${nueva.id}`, { numero: 21, zona: 'Patio', puestos: 4, activa: true })).json().mesa).toMatchObject({ numero: 21, puestos: 4 })

    const ocupada = await abrir(10)
    const m10 = await mesaId(ids.villaluz, 10)
    const r2 = await admin.put(`/api/admin/mesas/${m10}`, { numero: 10, zona: 'Terraza', puestos: 8, activa: false })
    expect(r2.statusCode).toBe(422)
    expect((await mesero.post(`/api/cuentas/${ocupada.id}/liberar`)).statusCode).toBe(200)
    expect((await admin.put(`/api/admin/mesas/${m10}`, { numero: 10, zona: 'Terraza', puestos: 8, activa: false })).statusCode).toBe(200)
    // Fuera de servicio: no aparece en el salón ni se puede abrir
    const salon = (await mesero.get(`/api/mesas/${ids.villaluz}/salon`)).json<{ salon: SalonDTO }>().salon
    expect(salon.mesas.some((m) => m.numero === 10)).toBe(false)
    expect((await mesero.post(`/api/mesas/${ids.villaluz}/cuentas`, { mesaId: m10, comensales: 2 })).statusCode).toBe(422)
  })
})

describe('mesas: tiempo real', () => {
  function conectar(ticket: string): Promise<Socket> {
    return new Promise((resolver, rechazar) => {
      const s = io(url, { path: '/socket.io', transports: ['websocket'], auth: { ticket }, extraHeaders: { origin: ORIGEN_WEB }, reconnection: false })
      sockets.push(s)
      s.on('connect', () => resolver(s))
      s.on('connect_error', (err) => rechazar(err))
    })
  }

  it('el mesero recibe sus rondas y cuentas en vivo, pero nunca los pedidos a domicilio', async () => {
    const s = await conectar((await mesero.post('/api/realtime/ticket', {})).json().ticket)
    const pedidos: PedidoDTO[] = []
    const cuentas: { cuentaId: string }[] = []
    s.on('pedido:actualizado', (p: PedidoDTO) => pedidos.push(p))
    s.on('cuenta:actualizada', (c: { cuentaId: string }) => cuentas.push(c))

    // Un domicilio nuevo en la misma sede
    const dom = await new Navegador(e.app).post('/api/pedidos', {
      sedeId: ids.villaluz,
      items: [{ productoId: ids.producto('la-callejera'), cantidad: 1 }],
      contacto: { nombre: 'Cliente Privado', telefono: '3105551234' },
      entrega: { direccion: 'Calle 70 # 79-10', lat: 4.6921, lng: -74.1052 },
      metodoPago: 'efectivo',
      aceptaPrivacidad: true,
    })
    expect(dom.statusCode).toBe(201)

    // Y una ronda de mesa que la cocina deja lista
    const cuenta = await abrir(9)
    const { pedido } = await ronda(cuenta.id, [{ slug: 'la-parchada', cantidad: 1 }])
    await mover(pedido!.id, 'en_preparacion', cocina)
    await mover(pedido!.id, 'listo', cocina)
    await new Promise((r) => setTimeout(r, 300))

    expect(pedidos.some((p) => p.id === pedido!.id && p.estado === 'listo')).toBe(true)
    expect(pedidos.every((p) => p.canal === 'mesa')).toBe(true)
    expect(JSON.stringify(pedidos)).not.toContain('Cliente Privado')
    expect(cuentas.some((c) => c.cuentaId === cuenta.id)).toBe(true)
  })
})

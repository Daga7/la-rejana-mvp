import type { ConsultaPasaporteDTO, CuentaMesaDTO, PasaporteClienteDTO, PedidoDTO } from '@rejana/shared'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsSeed, levantar, Navegador, type Entorno } from '../ayudas'

let e: Entorno
let ids: Awaited<ReturnType<typeof idsSeed>>
let admin: Navegador
let cliente: Navegador
let mesero: Navegador
let cocina: Navegador
let caja: Navegador
let codigo = ''

beforeAll(async () => {
  e = await levantar()
  ids = await idsSeed(e.c)
  const sesion = async (correo: string) => {
    const n = new Navegador(e.app)
    await n.ingresar(correo)
    return n
  }
  admin = await sesion('admin@larejana.test')
  cliente = await sesion('cliente@larejana.test')
  mesero = await sesion('mesero.villaluz@larejana.test')
  cocina = await sesion('cocina.villaluz@larejana.test')
  caja = await sesion('caja.villaluz@larejana.test')
})
afterAll(async () => {
  await e.cerrar()
})

const mesaId = async (numero: number, sedeId = ids.villaluz) => (await e.c.uow.repos.mesas.mesas(sedeId)).find((m) => m.numero === numero)!.id
const stock = () => e.c.uow.repos.inventario.stock(ids.villaluz)

/** Mesa con una ronda servida y cobrada por la caja. */
async function mesaCobrada(numero: number, slug: string, cantidad = 1): Promise<CuentaMesaDTO> {
  const cuenta = (await mesero.post(`/api/mesas/${ids.villaluz}/cuentas`, { mesaId: await mesaId(numero), comensales: 2 })).json<{ cuenta: CuentaMesaDTO }>().cuenta
  const ronda = (await mesero.post(`/api/cuentas/${cuenta.id}/rondas`, { items: [{ productoId: ids.producto(slug), cantidad }] })).json<{ pedido: PedidoDTO }>().pedido
  for (const [estado, nav] of [['en_preparacion', cocina], ['listo', cocina], ['entregado', mesero]] as const) expect((await nav.patch(`/api/pedidos/${ronda.id}/estado`, { estado })).statusCode).toBe(200)
  const r = await caja.post(`/api/cuentas/${cuenta.id}/cobrar`, { pagos: [{ metodo: 'efectivo', monto: ronda.total }], propina: 0 })
  expect(r.statusCode).toBe(200)
  return r.json<{ cuenta: CuentaMesaDTO }>().cuenta
}

describe('pasaporte: configuración e inscripción', () => {
  it('el admin configura el programa (con premio) y nadie más puede', async () => {
    const config = { activo: true, sellosParaPremio: 2, montoMinimo: 20000, premioProductoId: ids.producto('choriperro-clasico'), premioDescripcion: 'Un choriperro clásico de regalo', vigenciaMeses: 6 }
    expect((await admin.put('/api/admin/pasaporte', { ...config, premioProductoId: null })).statusCode).toBe(400)
    const r = await admin.put('/api/admin/pasaporte', config)
    expect(r.statusCode).toBe(200)
    expect(r.json().config).toMatchObject({ activo: true, sellosParaPremio: 2, premioNombre: 'Choriperro Clásico' })
    expect((await caja.put('/api/admin/pasaporte', config)).statusCode).toBe(403)
    expect((await caja.get('/api/admin/pasaporte')).statusCode).toBe(403)
  })

  it('el cliente lo activa con autorización expresa; el personal y los invitados no tienen pasaporte', async () => {
    expect((await cliente.get('/api/pasaporte')).json<{ pasaporte: PasaporteClienteDTO }>().pasaporte).toMatchObject({ inscrito: false, codigo: null })
    expect((await cliente.post('/api/pasaporte/inscripcion', {})).statusCode).toBe(400)
    const r = await cliente.post('/api/pasaporte/inscripcion', { acepto: true })
    expect(r.statusCode).toBe(201)
    const p = r.json<{ pasaporte: PasaporteClienteDTO }>().pasaporte
    expect(p).toMatchObject({ inscrito: true, sellosVigentes: 0, programa: { sellosParaPremio: 2, montoMinimo: 20000 } })
    expect(p.codigo).toMatch(/^[A-HJKMNP-Z2-9]{8}$/)
    codigo = p.codigo!
    const registro = await e.c.conexion.db.execute<{ aceptado_en: Date; version_terminos: string }>(sql`select aceptado_en, version_terminos from pasaportes`)
    expect(registro.rows[0]).toMatchObject({ version_terminos: '2026-11' })

    expect((await caja.get('/api/pasaporte')).statusCode).toBe(403)
    expect((await new Navegador(e.app).get('/api/pasaporte')).statusCode).toBe(401)
  })
})

describe('pasaporte: sellos en la caja', () => {
  it('la caja ve solo el nombre de pila y los sellos (minimización de datos)', async () => {
    const r = await caja.get(`/api/pasaporte/codigos/${codigo.slice(0, 4).toLowerCase()}-${codigo.slice(4)}`)
    expect(r.statusCode).toBe(200)
    const datos = r.json<{ cliente: ConsultaPasaporteDTO }>().cliente
    expect(Object.keys(datos).sort()).toEqual(['nombre', 'premioNombre', 'premiosDisponibles', 'sellosParaPremio', 'sellosVigentes'])
    expect(datos).toMatchObject({ nombre: 'Ana', sellosVigentes: 0 })
    expect(JSON.stringify(datos)).not.toMatch(/@|\+57|Cliente/)
    expect((await caja.get('/api/pasaporte/codigos/ZZZZZZZZ')).statusCode).toBe(404)
    expect((await cocina.get(`/api/pasaporte/codigos/${codigo}`)).statusCode).toBe(403)
    expect((await mesero.get(`/api/pasaporte/codigos/${codigo}`)).statusCode).toBe(403)
  })

  it('sella una mesa cobrada una sola vez; no sella mesas abiertas ni compras bajo el mínimo', async () => {
    const cuenta = await mesaCobrada(1, 'la-rejana')
    const r = await caja.post('/api/pasaporte/sellos', { codigo, cuentaId: cuenta.id })
    expect(r.statusCode).toBe(200)
    expect(r.json<{ cliente: ConsultaPasaporteDTO }>().cliente.sellosVigentes).toBe(1)
    const doble = await caja.post('/api/pasaporte/sellos', { codigo, cuentaId: cuenta.id })
    expect(doble.statusCode).toBe(409)

    const barata = await mesaCobrada(2, 'choriperro-clasico')
    const minimo = await caja.post('/api/pasaporte/sellos', { codigo, cuentaId: barata.id })
    expect(minimo.statusCode).toBe(422)
    expect(minimo.json().error.mensaje).toMatch(/mínima/)

    const abierta = (await mesero.post(`/api/mesas/${ids.villaluz}/cuentas`, { mesaId: await mesaId(3), comensales: 2 })).json<{ cuenta: CuentaMesaDTO }>().cuenta
    expect((await caja.post('/api/pasaporte/sellos', { codigo, cuentaId: abierta.id })).statusCode).toBe(422)
    // Otra sede: la caja de Villaluz no sella cuentas de Normandía
    const normandia = (await admin.post(`/api/mesas/${ids.normandia}/cuentas`, { mesaId: await mesaId(1, ids.normandia), comensales: 2 })).json<{ cuenta: CuentaMesaDTO }>().cuenta
    expect((await caja.post('/api/pasaporte/sellos', { codigo, cuentaId: normandia.id })).statusCode).toBe(403)
  })

  it('un domicilio pagado del cliente inscrito recibe su sello al cerrarlo en caja', async () => {
    const creado = await cliente.post('/api/pedidos', {
      sedeId: ids.villaluz,
      items: [{ productoId: ids.producto('la-callejera'), cantidad: 1 }],
      contacto: { nombre: 'Ana María Cliente', telefono: '3201234567' },
      entrega: { direccion: 'Calle 68 # 78-15', lat: 4.6912, lng: -74.1081 },
      metodoPago: 'efectivo',
    })
    expect(creado.statusCode).toBe(201)
    const pedido = creado.json().pedido as PedidoDTO
    const doms = (await caja.get(`/api/operacion/domiciliarios?sedeId=${ids.villaluz}`)).json().domiciliarios as { id: string }[]
    expect((await caja.post(`/api/pedidos/${pedido.id}/asignar`, { domiciliarioId: doms[0]!.id })).statusCode).toBe(200)
    for (const [estado, nav] of [['en_preparacion', cocina], ['listo', cocina], ['en_camino', caja], ['entregado', caja]] as const) expect((await nav.patch(`/api/pedidos/${pedido.id}/estado`, { estado })).statusCode).toBe(200)
    expect((await caja.post(`/api/pedidos/${pedido.id}/pagos`, { metodo: 'efectivo', monto: pedido.total })).statusCode).toBe(200)
    expect((await caja.post(`/api/pedidos/${pedido.id}/cerrar`)).statusCode).toBe(200)
    const p = (await cliente.get('/api/pasaporte')).json<{ pasaporte: PasaporteClienteDTO }>().pasaporte
    expect(p).toMatchObject({ sellosVigentes: 2, premiosDisponibles: 1 })
    expect(p.historial.map((h) => h.detalle)).toEqual(expect.arrayContaining(['Pedido a domicilio', 'Compra en la mesa']))
  })
})

describe('pasaporte: canje del premio', () => {
  it('canjea en una mesa abierta: gasta los sellos y agrega el premio gratis, que descuenta inventario', async () => {
    const cuenta = (await mesero.post(`/api/mesas/${ids.villaluz}/cuentas`, { mesaId: await mesaId(4), comensales: 2 })).json<{ cuenta: CuentaMesaDTO }>().cuenta
    const antes = await stock()
    const r = await caja.post('/api/pasaporte/canjes', { codigo, cuentaId: cuenta.id })
    expect(r.statusCode).toBe(200)
    expect(r.json<{ cliente: ConsultaPasaporteDTO }>().cliente).toMatchObject({ sellosVigentes: 0, premiosDisponibles: 0 })
    const detalle = (await mesero.get(`/api/cuentas/${cuenta.id}`)).json<{ cuenta: CuentaMesaDTO }>().cuenta
    expect(detalle.rondas).toHaveLength(1)
    expect(detalle.rondas[0]).toMatchObject({ total: 0, estado: 'recibido', items: [expect.objectContaining({ nombre: 'Choriperro Clásico', precioUnitario: 0, notas: 'Premio del Pasaporte' })] })
    expect(detalle.subtotal).toBe(0)
    const recetas = await e.c.uow.repos.catalogo.recetas([ids.producto('choriperro-clasico')])
    const despues = await stock()
    for (const l of recetas.get(ids.producto('choriperro-clasico'))!) expect(antes.get(l.insumoId)! - despues.get(l.insumoId)!).toBeCloseTo(l.cantidad, 3)
    // Sin sellos suficientes no hay segundo premio
    const otra = await caja.post('/api/pasaporte/canjes', { codigo, cuentaId: cuenta.id })
    expect(otra.statusCode).toBe(422)
    expect(otra.json().error.mensaje).toMatch(/0 de 2/)
  })

  it('los sellos vencidos no cuentan', async () => {
    const pasaporte = (await e.c.uow.repos.pasaporte.porCodigo(codigo))!
    const viejo = await mesaCobrada(5, 'la-rejana')
    await e.c.uow.repos.pasaporte.crearSello({ clienteId: pasaporte.clienteId, sedeId: ids.villaluz, pedidoId: null, cuentaId: viejo.id, monto: 32000, otorgadoPor: null, creadoEn: new Date(e.reloj.t - 200 * 86_400_000) })
    expect((await caja.get(`/api/pasaporte/codigos/${codigo}`)).json<{ cliente: ConsultaPasaporteDTO }>().cliente.sellosVigentes).toBe(0)
  })
})

describe('pasaporte: salir del programa (Ley 1581)', () => {
  it('borra la inscripción y los sellos; el código deja de servir y los canjes quedan sin datos del cliente', async () => {
    const r = await cliente.delete('/api/pasaporte')
    expect(r.statusCode).toBe(204)
    expect((await cliente.get('/api/pasaporte')).json<{ pasaporte: PasaporteClienteDTO }>().pasaporte).toMatchObject({ inscrito: false, codigo: null, historial: [] })
    expect((await caja.get(`/api/pasaporte/codigos/${codigo}`)).statusCode).toBe(404)
    const quedan = await e.c.conexion.db.execute<{ sellos: number; canjes_con_cliente: number; canjes: number }>(
      sql`select (select count(*)::int from sellos) as sellos, (select count(*)::int from canjes_pasaporte where cliente_id is not null) as canjes_con_cliente, (select count(*)::int from canjes_pasaporte) as canjes`,
    )
    expect(quedan.rows[0]).toEqual({ sellos: 0, canjes_con_cliente: 0, canjes: 1 })
  })
})

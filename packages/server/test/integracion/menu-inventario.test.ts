import type { MenuDTO } from '@rejana/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { unidadesPreparables } from '../../src/domain/inventario'
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

const menuDe = async (sedeId: string) => (await new Navegador(e.app).get(`/api/sedes/${sedeId}/menu`)).json<MenuDTO>()
const producto = (m: MenuDTO, slug: string) => m.categorias.flatMap((c) => c.productos).find((p) => p.slug === slug)

describe('menú por sede', () => {
  it('lista las sedes activas', async () => {
    const r = await new Navegador(e.app).get('/api/sedes')
    expect(r.json().sedes.map((s: { slug: string }) => s.slug).sort()).toEqual(['normandia', 'villaluz'])
  })

  it('cada sede tiene su menú y sus precios', async () => {
    const villaluz = await menuDe(ids.villaluz)
    const normandia = await menuDe(ids.normandia)
    expect(villaluz.categorias.map((c) => c.nombre)).toEqual(['Hamburguesas', 'Choriperros'])
    expect(villaluz.categorias.flatMap((c) => c.productos)).toHaveLength(6)
    expect(producto(normandia, 'choriperro-ranchero')).toBeUndefined()
    expect(producto(villaluz, 'la-rejana')!.precio).toBe(32000)
    expect(producto(normandia, 'la-rejana')!.precio).toBe(33000)
  })

  it('marca agotado automáticamente un producto sin insumos (Normandía no tiene maduro)', async () => {
    const parchada = producto(await menuDe(ids.normandia), 'la-parchada')!
    expect(parchada.maxUnidades).toBe(0)
    expect(parchada.agotado).toBe(true)
    expect(parchada.disponible).toBe(true) // el interruptor manual sigue encendido
  })

  it('calcula las unidades preparables con el insumo más escaso', async () => {
    const stock = await e.c.uow.repos.inventario.stock(ids.villaluz)
    const receta = (await e.c.uow.repos.catalogo.recetas([ids.producto('la-callejera')])).get(ids.producto('la-callejera'))!
    const esperado = unidadesPreparables(receta, stock)
    expect(producto(await menuDe(ids.villaluz), 'la-callejera')!.maxUnidades).toBe(esperado)
  })
})

describe('inventario (admin)', () => {
  it('una entrada de mercancía reactiva el producto agotado', async () => {
    const r = await admin.post('/api/admin/inventario/movimientos', { sedeId: ids.normandia, insumoId: ids.insumo('Plátano maduro'), modo: 'sumar', cantidad: 10, nota: 'Compra plaza' })
    expect(r.statusCode).toBe(200)
    expect(r.json().saldo).toBe(10)
    const parchada = producto(await menuDe(ids.normandia), 'la-parchada')!
    expect(parchada.agotado).toBe(false)
    expect(parchada.maxUnidades).toBeGreaterThan(0)
    expect(parchada.maxUnidades).toBeLessThanOrEqual(20) // 10 maduros ÷ 0,5
  })

  it('un conteo físico deja el saldo exacto, registra el movimiento y la auditoría', async () => {
    const r = await admin.post('/api/admin/inventario/movimientos', { sedeId: ids.villaluz, insumoId: ids.insumo('Pan brioche'), modo: 'fijar', cantidad: 0, nota: 'Se acabó el pan' })
    expect(r.json().saldo).toBe(0)
    const m = await menuDe(ids.villaluz)
    for (const slug of ['la-rejana', 'la-callejera', 'la-parchada']) expect(producto(m, slug)!.agotado).toBe(true)
    expect(producto(m, 'choriperro-clasico')!.agotado).toBe(false)

    const movs = (await admin.get(`/api/inventario/${ids.villaluz}/movimientos?insumoId=${ids.insumo('Pan brioche')}`)).json().movimientos
    expect(movs[0]).toMatchObject({ tipo: 'ajuste_manual', saldoResultante: 0, usuarioNombre: 'Daniel (Admin)' })
    const auditoria = await e.c.uow.repos.auditoria.listar({ entidad: 'inventario', limite: 5 })
    expect(auditoria[0]).toMatchObject({ accion: 'inventario.ajuste', actorRol: 'admin' })
    // Se restablece para las demás pruebas
    await admin.post('/api/admin/inventario/movimientos', { sedeId: ids.villaluz, insumoId: ids.insumo('Pan brioche'), modo: 'fijar', cantidad: 32 })
  })

  it('apagar un producto en una sede lo marca agotado aunque haya stock', async () => {
    const productoId = ids.producto('choriperro-clasico')
    await admin.put(`/api/admin/menu/${ids.villaluz}/${productoId}`, { precio: 15000, disponible: false, orden: 3 })
    expect(producto(await menuDe(ids.villaluz), 'choriperro-clasico')!.agotado).toBe(true)
    await admin.put(`/api/admin/menu/${ids.villaluz}/${productoId}`, { precio: 15000, disponible: true, orden: 3 })
  })

  it('el cambio de precio queda en la auditoría con antes y después', async () => {
    const productoId = ids.producto('la-rejana')
    await admin.put(`/api/admin/menu/${ids.villaluz}/${productoId}`, { precio: 34000, disponible: true, orden: 0 })
    expect(producto(await menuDe(ids.villaluz), 'la-rejana')!.precio).toBe(34000)
    const [registro] = await e.c.uow.repos.auditoria.listar({ entidad: 'producto', limite: 1 })
    expect(registro).toMatchObject({ accion: 'menu.cambio_precio' })
    expect(registro!.datos).toMatchObject({ antes: { precio: 32000 }, despues: { precio: 34000 } })
  })

  it('cambiar la receta cambia la capacidad de producción', async () => {
    const productoId = ids.producto('choriperro-clasico')
    const antes = producto(await menuDe(ids.villaluz), 'choriperro-clasico')!.maxUnidades!
    // Ahora lleva 2 chorizos: alcanza para la mitad (o menos, según otros insumos).
    const receta = (await e.c.uow.repos.catalogo.recetas([productoId])).get(productoId)!
    const nueva = receta.map((l) => ({ insumoId: l.insumoId, cantidad: l.insumoNombre === 'Chorizo santarrosano' ? 2 : l.cantidad }))
    expect((await admin.put(`/api/admin/productos/${productoId}/receta`, { items: nueva })).statusCode).toBe(200)
    const despues = producto(await menuDe(ids.villaluz), 'choriperro-clasico')!.maxUnidades!
    expect(despues).toBeLessThan(antes)
    await admin.put(`/api/admin/productos/${productoId}/receta`, { items: receta.map((l) => ({ insumoId: l.insumoId, cantidad: l.cantidad })) })
  })

  it('no permite cambiar la unidad de un insumo con existencias', async () => {
    const r = await admin.put(`/api/admin/insumos/${ids.insumo('Chorizo santarrosano')}`, { nombre: 'Chorizo santarrosano', unidad: 'g', activo: true })
    expect(r.statusCode).toBe(409)
  })
})

describe('permisos de inventario por rol y sede', () => {
  it('cocina ve el inventario de su sede pero no el de la otra', async () => {
    const cocina = new Navegador(e.app)
    await cocina.ingresar('cocina.villaluz@larejana.test')
    expect((await cocina.get(`/api/inventario/${ids.villaluz}`)).statusCode).toBe(200)
    expect((await cocina.get(`/api/inventario/${ids.normandia}`)).statusCode).toBe(403)
  })

  it('cocina y caja no pueden registrar movimientos ni cambiar precios', async () => {
    for (const correo of ['cocina.villaluz@larejana.test', 'caja.villaluz@larejana.test']) {
      const nav = new Navegador(e.app)
      await nav.ingresar(correo)
      const mov = await nav.post('/api/admin/inventario/movimientos', { sedeId: ids.villaluz, insumoId: ids.insumo('Pan brioche'), modo: 'sumar', cantidad: 5 })
      expect(mov.statusCode).toBe(403)
      const precio = await nav.put(`/api/admin/menu/${ids.villaluz}/${ids.producto('la-rejana')}`, { precio: 1000, disponible: true, orden: 0 })
      expect(precio.statusCode).toBe(403)
    }
  })

  it('un cliente no ve inventarios y un invitado debe iniciar sesión', async () => {
    const cliente = new Navegador(e.app)
    await cliente.ingresar('cliente@larejana.test')
    expect((await cliente.get(`/api/inventario/${ids.villaluz}`)).statusCode).toBe(403)
    expect((await new Navegador(e.app).get(`/api/inventario/${ids.villaluz}`)).statusCode).toBe(401)
    expect((await new Navegador(e.app).get('/api/admin/catalogo')).statusCode).toBe(401)
  })

  it('el admin ve el inventario de ambas sedes con la capacidad por producto', async () => {
    const r = (await admin.get(`/api/inventario/${ids.normandia}`)).json()
    expect(r.inventario.length).toBeGreaterThan(10)
    expect(r.capacidad.find((p: { nombre: string }) => p.nombre === 'La Rejana')).toBeDefined()
    expect(r.alertas).toBeGreaterThan(0) // Normandía arranca con chorizo y codorniz bajo el mínimo
  })
})

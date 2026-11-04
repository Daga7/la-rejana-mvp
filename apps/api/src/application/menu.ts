import type { CategoriaMenuDTO, MenuDTO, ProductoMenuDTO, SedePublicaDTO } from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { unidadesPreparables } from '../domain/inventario'
import { exigirPermiso, type Actor } from '../domain/permisos'
import { estaAbierta, slugificar } from '../domain/sede'
import type { DatosSede, Producto, Repositorios, Sede, UnidadDeTrabajo } from '../ports/repositorios'
import type { PublicadorEventos, Reloj } from '../ports/servicios'
import { auditar, type ContextoSolicitud } from './comun'

export interface DepsMenu {
  uow: UnidadDeTrabajo
  reloj: Reloj
  eventos: PublicadorEventos
}

export function sedePublica(s: Sede, ahora: Date): SedePublicaDTO {
  return {
    id: s.id,
    slug: s.slug,
    nombre: s.nombre,
    direccion: s.direccion,
    barrio: s.barrio,
    telefono: s.telefono,
    lat: s.lat,
    lng: s.lng,
    horaApertura: s.horaApertura,
    horaCierre: s.horaCierre,
    abierta: s.activa && estaAbierta(s, ahora),
    tarifaDomicilio: s.tarifaDomicilio,
    minutosPreparacion: s.minutosPreparacion,
    limiteMinutosEntrega: s.limiteMinutosEntrega,
    radioEntregaKm: s.radioEntregaKm,
    qrPagoUrl: s.qrPagoUrl,
    qrPagoInstrucciones: s.qrPagoInstrucciones,
  }
}

/** Productos del menú de una sede con su disponibilidad real según el inventario. */
export async function productosDeSede(repos: Repositorios, sedeId: string): Promise<(ProductoMenuDTO & { categoriaId: string })[]> {
  const [entradas, productos] = await Promise.all([repos.catalogo.menuDeSede(sedeId), repos.catalogo.productos()])
  const porId = new Map(productos.filter((p) => p.activo).map((p) => [p.id, p]))
  const vigentes = entradas.filter((e) => porId.has(e.productoId))
  const recetas = await repos.catalogo.recetas(vigentes.map((e) => e.productoId))
  const insumoIds = [...new Set([...recetas.values()].flat().map((l) => l.insumoId))]
  const stock = await repos.inventario.stock(sedeId, insumoIds)
  return vigentes.map((e) => {
    const p = porId.get(e.productoId)!
    const maxUnidades = unidadesPreparables(recetas.get(p.id) ?? [], stock)
    return {
      id: p.id,
      categoriaId: p.categoriaId,
      nombre: p.nombre,
      slug: p.slug,
      descripcion: p.descripcion,
      imagenUrl: p.imagenUrl,
      precio: e.precio,
      disponible: e.disponible,
      maxUnidades,
      agotado: !e.disponible || maxUnidades === 0,
    }
  })
}

export function crearCasosMenu(d: DepsMenu) {
  const { uow, reloj } = d

  async function sedeActiva(id: string) {
    const s = await uow.repos.sedes.porId(id)
    if (!s || !s.activa) throw new ErrorDominio('SEDE_NO_DISPONIBLE', 'Esa sede no está disponible')
    return s
  }

  async function slugProductoLibre(nombre: string, exceptoId?: string) {
    const base = slugificar(nombre) || 'producto'
    let slug = base
    for (let i = 2; await uow.repos.catalogo.slugProductoExiste(slug, exceptoId); i++) slug = `${base}-${i}`
    return slug
  }

  return {
    async sedes(): Promise<SedePublicaDTO[]> {
      const ahora = reloj.ahora()
      return (await uow.repos.sedes.todas(true)).map((s) => sedePublica(s, ahora))
    },

    async menu(sedeId: string): Promise<MenuDTO> {
      const sede = await sedeActiva(sedeId)
      const [categorias, productos] = await Promise.all([uow.repos.catalogo.categorias(true), productosDeSede(uow.repos, sedeId)])
      const secciones: CategoriaMenuDTO[] = categorias
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          slug: c.slug,
          productos: productos.filter((p) => p.categoriaId === c.id).map(({ categoriaId: _c, ...p }) => p),
        }))
        .filter((c) => c.productos.length > 0)
      return { sede: sedePublica(sede, reloj.ahora()), categorias: secciones, generadoEn: reloj.ahora().toISOString() }
    },

    // --- Administración del catálogo ------------------------------------------------------------

    async catalogo(actor: Actor) {
      exigirPermiso(actor, 'menu.gestionar')
      const [categorias, productos, insumos, sedes] = await Promise.all([
        uow.repos.catalogo.categorias(false),
        uow.repos.catalogo.productos(),
        uow.repos.inventario.insumos(false),
        uow.repos.sedes.todas(false),
      ])
      const recetas = await uow.repos.catalogo.recetas(productos.map((p) => p.id))
      const menus = await Promise.all(sedes.map((s) => uow.repos.catalogo.menuDeSede(s.id)))
      const entradas = menus.flat()
      return {
        categorias,
        insumos,
        sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre, activa: s.activa })),
        productos: productos.map((p) => ({
          ...p,
          receta: recetas.get(p.id) ?? [],
          menu: entradas.filter((e) => e.productoId === p.id).map((e) => ({ sedeId: e.sedeId, precio: e.precio, disponible: e.disponible, orden: e.orden })),
        })),
      }
    },

    async crearCategoria(actor: Actor, datos: { nombre: string; orden: number; activa: boolean }, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'menu.gestionar')
      const slug = slugificar(datos.nombre)
      if ((await uow.repos.catalogo.categorias(false)).some((c) => c.slug === slug)) throw err.conflicto('Ya existe una categoría con ese nombre')
      const c = await uow.repos.catalogo.crearCategoria({ ...datos, slug })
      await auditar(uow.repos, actor, 'categoria.crear', 'categoria', c.id, datos, ctx.ip)
      return c
    },

    async actualizarCategoria(actor: Actor, id: string, datos: { nombre: string; orden: number; activa: boolean }, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'menu.gestionar')
      const antes = await uow.repos.catalogo.categoriaPorId(id)
      if (!antes) throw err.noEncontrado('La categoría no existe')
      const c = await uow.repos.catalogo.actualizarCategoria(id, datos)
      await auditar(uow.repos, actor, 'categoria.actualizar', 'categoria', id, { antes, despues: datos }, ctx.ip)
      return c
    },

    async crearProducto(actor: Actor, datos: Omit<Producto, 'id' | 'slug'>, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'menu.gestionar')
      if (!(await uow.repos.catalogo.categoriaPorId(datos.categoriaId))) throw err.noEncontrado('La categoría no existe')
      const p = await uow.repos.catalogo.crearProducto({ ...datos, slug: await slugProductoLibre(datos.nombre) })
      await auditar(uow.repos, actor, 'producto.crear', 'producto', p.id, datos, ctx.ip)
      return p
    },

    async actualizarProducto(actor: Actor, id: string, datos: Omit<Producto, 'id' | 'slug'>, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'menu.gestionar')
      const antes = await uow.repos.catalogo.productoPorId(id)
      if (!antes) throw err.noEncontrado('El producto no existe')
      if (!(await uow.repos.catalogo.categoriaPorId(datos.categoriaId))) throw err.noEncontrado('La categoría no existe')
      const slug = antes.nombre === datos.nombre ? antes.slug : await slugProductoLibre(datos.nombre, id)
      const p = await uow.repos.catalogo.actualizarProducto(id, { ...datos, slug })
      await auditar(uow.repos, actor, 'producto.actualizar', 'producto', id, { antes, despues: datos }, ctx.ip)
      for (const e of await uow.repos.catalogo.entradasMenu(id)) d.eventos.menuCambio(e.sedeId)
      return p
    },

    async guardarReceta(actor: Actor, productoId: string, items: { insumoId: string; cantidad: number }[], ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'menu.gestionar')
      if (!(await uow.repos.catalogo.productoPorId(productoId))) throw err.noEncontrado('El producto no existe')
      const insumos = new Map((await uow.repos.inventario.insumos(false)).map((i) => [i.id, i]))
      for (const it of items) if (!insumos.has(it.insumoId)) throw err.validacion('La receta tiene un insumo que no existe')
      const antes = (await uow.repos.catalogo.recetas([productoId])).get(productoId) ?? []
      await uow.transaccion(async (repos) => {
        await repos.catalogo.reemplazarReceta(productoId, items)
        await auditar(repos, actor, 'receta.actualizar', 'producto', productoId, { antes: antes.map((l) => ({ insumoId: l.insumoId, cantidad: l.cantidad })), despues: items }, ctx.ip)
      })
      for (const e of await uow.repos.catalogo.entradasMenu(productoId)) d.eventos.menuCambio(e.sedeId)
      return (await uow.repos.catalogo.recetas([productoId])).get(productoId) ?? []
    },

    /** Agrega o actualiza un producto en el menú de una sede (precio por sede). Queda en auditoría. */
    async guardarEnMenu(actor: Actor, sedeId: string, productoId: string, datos: { precio: number; disponible: boolean; orden: number }, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'menu.gestionar')
      if (!(await uow.repos.sedes.porId(sedeId))) throw err.noEncontrado('La sede no existe')
      if (!(await uow.repos.catalogo.productoPorId(productoId))) throw err.noEncontrado('El producto no existe')
      const antes = (await uow.repos.catalogo.entradasMenu(productoId)).find((e) => e.sedeId === sedeId) ?? null
      await uow.repos.catalogo.guardarEntradaMenu({ sedeId, productoId, ...datos })
      const accion = antes && antes.precio !== datos.precio ? 'menu.cambio_precio' : 'menu.guardar'
      await auditar(uow.repos, actor, accion, 'producto', productoId, { sedeId, antes, despues: datos }, ctx.ip)
      d.eventos.menuCambio(sedeId)
    },

    async quitarDeMenu(actor: Actor, sedeId: string, productoId: string, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'menu.gestionar')
      await uow.repos.catalogo.quitarDeMenu(sedeId, productoId)
      await auditar(uow.repos, actor, 'menu.quitar', 'producto', productoId, { sedeId }, ctx.ip)
      d.eventos.menuCambio(sedeId)
    },

    // --- Sedes ------------------------------------------------------------------------------------

    async sedesAdmin(actor: Actor) {
      exigirPermiso(actor, 'sedes.gestionar')
      const ahora = reloj.ahora()
      return (await uow.repos.sedes.todas(false)).map((s) => ({ ...sedePublica(s, ahora), activa: s.activa }))
    },

    async crearSede(actor: Actor, datos: DatosSede, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'sedes.gestionar')
      const base = slugificar(datos.nombre) || 'sede'
      let slug = base
      for (let i = 2; await uow.repos.sedes.slugExiste(slug); i++) slug = `${base}-${i}`
      const s = await uow.repos.sedes.crear({ ...datos, slug })
      // Toda sede nueva arranca con todos los insumos en cero (para poder registrar entradas).
      for (const i of await uow.repos.inventario.insumos(true)) await uow.repos.inventario.asegurarFila(s.id, i.id)
      await auditar(uow.repos, actor, 'sede.crear', 'sede', s.id, { ...datos }, ctx.ip)
      return s
    },

    async actualizarSede(actor: Actor, id: string, datos: DatosSede, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'sedes.gestionar')
      const antes = await uow.repos.sedes.porId(id)
      if (!antes) throw err.noEncontrado('La sede no existe')
      const s = await uow.repos.sedes.actualizar(id, datos)
      await auditar(uow.repos, actor, 'sede.actualizar', 'sede', id, { antes, despues: datos }, ctx.ip)
      d.eventos.menuCambio(id)
      return s
    },
  }
}

export type CasosMenu = ReturnType<typeof crearCasosMenu>

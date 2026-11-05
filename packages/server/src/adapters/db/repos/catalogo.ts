import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { ErrorDominio } from '../../../domain/errores'
import { r3 } from '../../../domain/inventario'
import type { Categoria, Insumo, LineaRecetaDetalle, Producto, RepoCatalogo, RepoInventario, RepoSedes, Sede } from '../../../ports/repositorios'
import type { Ejecutor } from '../cliente'
import { categorias, insumos, inventario, menuSede, movimientosInventario, pedidos, productos, recetaItems, sedes, usuarios } from '../schema'

const hhmm = (t: string) => t.slice(0, 5)

const aSede = (r: typeof sedes.$inferSelect): Sede => ({
  id: r.id,
  slug: r.slug,
  nombre: r.nombre,
  direccion: r.direccion,
  barrio: r.barrio,
  telefono: r.telefono,
  lat: r.lat,
  lng: r.lng,
  horaApertura: hhmm(r.horaApertura),
  horaCierre: hhmm(r.horaCierre),
  tarifaDomicilio: r.tarifaDomicilio,
  limiteMinutosEntrega: r.limiteMinutosEntrega,
  minutosPreparacion: r.minutosPreparacion,
  radioEntregaKm: r.radioEntregaKm,
  qrPagoUrl: r.qrPagoUrl,
  qrPagoInstrucciones: r.qrPagoInstrucciones,
  activa: r.activa,
})

export function repoSedes(db: Ejecutor): RepoSedes {
  return {
    async todas(soloActivas) {
      const filas = await db
        .select()
        .from(sedes)
        .where(soloActivas ? eq(sedes.activa, true) : undefined)
        .orderBy(asc(sedes.creadoEn))
      return filas.map(aSede)
    },
    async porId(id) {
      const [r] = await db.select().from(sedes).where(eq(sedes.id, id)).limit(1)
      return r ? aSede(r) : null
    },
    async crear(datos) {
      const [r] = await db.insert(sedes).values(datos).returning()
      return aSede(r!)
    },
    async actualizar(id, datos) {
      const [r] = await db
        .update(sedes)
        .set({ ...datos, actualizadoEn: new Date() })
        .where(eq(sedes.id, id))
        .returning()
      if (!r) throw new ErrorDominio('NO_ENCONTRADO', 'La sede no existe')
      return aSede(r)
    },
    async slugExiste(slug) {
      const [r] = await db.select({ id: sedes.id }).from(sedes).where(eq(sedes.slug, slug)).limit(1)
      return !!r
    },
  }
}

const aCategoria = (r: typeof categorias.$inferSelect): Categoria => ({ id: r.id, nombre: r.nombre, slug: r.slug, orden: r.orden, activa: r.activa })
const aProducto = (r: typeof productos.$inferSelect): Producto => ({
  id: r.id,
  categoriaId: r.categoriaId,
  nombre: r.nombre,
  slug: r.slug,
  descripcion: r.descripcion,
  imagenUrl: r.imagenUrl,
  activo: r.activo,
})

export function repoCatalogo(db: Ejecutor): RepoCatalogo {
  return {
    async categorias(soloActivas) {
      const filas = await db
        .select()
        .from(categorias)
        .where(soloActivas ? eq(categorias.activa, true) : undefined)
        .orderBy(asc(categorias.orden), asc(categorias.nombre))
      return filas.map(aCategoria)
    },
    async categoriaPorId(id) {
      const [r] = await db.select().from(categorias).where(eq(categorias.id, id)).limit(1)
      return r ? aCategoria(r) : null
    },
    async crearCategoria(datos) {
      const [r] = await db.insert(categorias).values(datos).returning()
      return aCategoria(r!)
    },
    async actualizarCategoria(id, datos) {
      const [r] = await db.update(categorias).set(datos).where(eq(categorias.id, id)).returning()
      if (!r) throw new ErrorDominio('NO_ENCONTRADO', 'La categoría no existe')
      return aCategoria(r)
    },
    async productos() {
      const filas = await db.select().from(productos).orderBy(asc(productos.nombre))
      return filas.map(aProducto)
    },
    async productoPorId(id) {
      const [r] = await db.select().from(productos).where(eq(productos.id, id)).limit(1)
      return r ? aProducto(r) : null
    },
    async crearProducto(datos) {
      const [r] = await db.insert(productos).values(datos).returning()
      return aProducto(r!)
    },
    async actualizarProducto(id, datos) {
      const [r] = await db
        .update(productos)
        .set({ ...datos, actualizadoEn: new Date() })
        .where(eq(productos.id, id))
        .returning()
      if (!r) throw new ErrorDominio('NO_ENCONTRADO', 'El producto no existe')
      return aProducto(r)
    },
    async slugProductoExiste(slug, exceptoId) {
      const [r] = await db
        .select({ id: productos.id })
        .from(productos)
        .where(and(eq(productos.slug, slug), exceptoId ? ne(productos.id, exceptoId) : undefined))
        .limit(1)
      return !!r
    },
    async recetas(productoIds) {
      const mapa = new Map<string, LineaRecetaDetalle[]>()
      if (productoIds.length === 0) return mapa
      const filas = await db
        .select({
          productoId: recetaItems.productoId,
          insumoId: recetaItems.insumoId,
          cantidad: recetaItems.cantidad,
          insumoNombre: insumos.nombre,
          unidad: insumos.unidad,
        })
        .from(recetaItems)
        .innerJoin(insumos, eq(insumos.id, recetaItems.insumoId))
        .where(inArray(recetaItems.productoId, productoIds))
        .orderBy(asc(insumos.nombre))
      for (const f of filas) {
        const lista = mapa.get(f.productoId) ?? []
        lista.push({ insumoId: f.insumoId, insumoNombre: f.insumoNombre, unidad: f.unidad, cantidad: Number(f.cantidad) })
        mapa.set(f.productoId, lista)
      }
      return mapa
    },
    async reemplazarReceta(productoId, items) {
      await db.delete(recetaItems).where(eq(recetaItems.productoId, productoId))
      if (items.length) await db.insert(recetaItems).values(items.map((i) => ({ productoId, insumoId: i.insumoId, cantidad: i.cantidad })))
    },
    async menuDeSede(sedeId) {
      const filas = await db.select().from(menuSede).where(eq(menuSede.sedeId, sedeId)).orderBy(asc(menuSede.orden))
      return filas.map((f) => ({ sedeId: f.sedeId, productoId: f.productoId, precio: f.precio, disponible: f.disponible, orden: f.orden }))
    },
    async entradasMenu(productoId) {
      const filas = await db.select().from(menuSede).where(eq(menuSede.productoId, productoId))
      return filas.map((f) => ({ sedeId: f.sedeId, productoId: f.productoId, precio: f.precio, disponible: f.disponible, orden: f.orden }))
    },
    async guardarEntradaMenu(e) {
      await db
        .insert(menuSede)
        .values({ ...e })
        .onConflictDoUpdate({
          target: [menuSede.sedeId, menuSede.productoId],
          set: { precio: e.precio, disponible: e.disponible, orden: e.orden, actualizadoEn: new Date() },
        })
    },
    async quitarDeMenu(sedeId, productoId) {
      await db.delete(menuSede).where(and(eq(menuSede.sedeId, sedeId), eq(menuSede.productoId, productoId)))
    },
  }
}

const aInsumo = (r: typeof insumos.$inferSelect): Insumo => ({ id: r.id, nombre: r.nombre, unidad: r.unidad, activo: r.activo })

export function repoInventario(db: Ejecutor): RepoInventario {
  return {
    async insumos(soloActivos) {
      const filas = await db
        .select()
        .from(insumos)
        .where(soloActivos ? eq(insumos.activo, true) : undefined)
        .orderBy(asc(insumos.nombre))
      return filas.map(aInsumo)
    },
    async insumoPorId(id) {
      const [r] = await db.select().from(insumos).where(eq(insumos.id, id)).limit(1)
      return r ? aInsumo(r) : null
    },
    async crearInsumo(datos) {
      const [r] = await db.insert(insumos).values(datos).returning()
      return aInsumo(r!)
    },
    async actualizarInsumo(id, datos) {
      const [r] = await db.update(insumos).set(datos).where(eq(insumos.id, id)).returning()
      if (!r) throw new ErrorDominio('NO_ENCONTRADO', 'El insumo no existe')
      return aInsumo(r)
    },
    async nombreInsumoExiste(nombre, exceptoId) {
      const [r] = await db
        .select({ id: insumos.id })
        .from(insumos)
        .where(and(sql`lower(${insumos.nombre}) = lower(${nombre})`, exceptoId ? ne(insumos.id, exceptoId) : undefined))
        .limit(1)
      return !!r
    },
    async deSede(sedeId) {
      const filas = await db
        .select({
          sedeId: inventario.sedeId,
          insumoId: inventario.insumoId,
          insumoNombre: insumos.nombre,
          unidad: insumos.unidad,
          cantidad: inventario.cantidad,
          stockMinimo: inventario.stockMinimo,
        })
        .from(inventario)
        .innerJoin(insumos, eq(insumos.id, inventario.insumoId))
        .where(eq(inventario.sedeId, sedeId))
        .orderBy(asc(insumos.nombre))
      return filas.map((f) => ({ ...f, cantidad: Number(f.cantidad), stockMinimo: Number(f.stockMinimo) }))
    },
    async stock(sedeId, insumoIds) {
      const filas = await db
        .select({ insumoId: inventario.insumoId, cantidad: inventario.cantidad })
        .from(inventario)
        .where(and(eq(inventario.sedeId, sedeId), insumoIds ? inArray(inventario.insumoId, insumoIds.length ? insumoIds : ['00000000-0000-0000-0000-000000000000']) : undefined))
      return new Map(filas.map((f) => [f.insumoId, Number(f.cantidad)]))
    },
    async bloquear(sedeId, insumoIds) {
      if (insumoIds.length === 0) return new Map()
      // Orden estable para evitar interbloqueos entre transacciones concurrentes.
      const filas = await db
        .select({ insumoId: inventario.insumoId, cantidad: inventario.cantidad })
        .from(inventario)
        .where(and(eq(inventario.sedeId, sedeId), inArray(inventario.insumoId, [...insumoIds].sort())))
        .orderBy(asc(inventario.insumoId))
        .for('update')
      return new Map(filas.map((f) => [f.insumoId, Number(f.cantidad)]))
    },
    async mover({ sedeId, insumoId, delta, tipo, pedidoId, usuarioId, nota }) {
      const d = r3(delta)
      let saldo: number
      try {
        if (d < 0) {
          // Salidas: solo se descuenta de una fila existente; el CHECK impide quedar en negativo.
          const [fila] = await db
            .update(inventario)
            .set({ cantidad: sql`${inventario.cantidad} + ${d}`, actualizadoEn: new Date() })
            .where(and(eq(inventario.sedeId, sedeId), eq(inventario.insumoId, insumoId)))
            .returning({ cantidad: inventario.cantidad })
          if (!fila) throw new ErrorDominio('STOCK_INSUFICIENTE', 'No hay inventario suficiente')
          saldo = Number(fila.cantidad)
        } else {
          const [fila] = await db
            .insert(inventario)
            .values({ sedeId, insumoId, cantidad: d })
            .onConflictDoUpdate({
              target: [inventario.sedeId, inventario.insumoId],
              set: { cantidad: sql`${inventario.cantidad} + ${d}`, actualizadoEn: new Date() },
            })
            .returning({ cantidad: inventario.cantidad })
          saldo = Number(fila!.cantidad)
        }
      } catch (e) {
        if (e instanceof ErrorDominio) throw e
        if ((e as { code?: string }).code === '23514' || (e as { cause?: { code?: string } }).cause?.code === '23514') {
          throw new ErrorDominio('STOCK_INSUFICIENTE', 'No hay inventario suficiente')
        }
        throw e
      }
      await db.insert(movimientosInventario).values({
        sedeId,
        insumoId,
        tipo,
        cantidad: d,
        saldoResultante: saldo,
        pedidoId: pedidoId ?? null,
        usuarioId: usuarioId ?? null,
        nota: nota ?? null,
      })
      return saldo
    },
    async fijarMinimo(sedeId, insumoId, minimo) {
      await db
        .insert(inventario)
        .values({ sedeId, insumoId, cantidad: 0, stockMinimo: minimo })
        .onConflictDoUpdate({ target: [inventario.sedeId, inventario.insumoId], set: { stockMinimo: minimo, actualizadoEn: new Date() } })
    },
    async asegurarFila(sedeId, insumoId) {
      await db.insert(inventario).values({ sedeId, insumoId, cantidad: 0 }).onConflictDoNothing()
    },
    async movimientos({ sedeId, insumoId, limite }) {
      const u = alias(usuarios, 'u')
      const filas = await db
        .select({
          id: movimientosInventario.id,
          sedeId: movimientosInventario.sedeId,
          insumoId: movimientosInventario.insumoId,
          insumoNombre: insumos.nombre,
          unidad: insumos.unidad,
          tipo: movimientosInventario.tipo,
          cantidad: movimientosInventario.cantidad,
          saldoResultante: movimientosInventario.saldoResultante,
          pedidoNumero: pedidos.numero,
          usuarioNombre: u.nombre,
          nota: movimientosInventario.nota,
          creadoEn: movimientosInventario.creadoEn,
        })
        .from(movimientosInventario)
        .innerJoin(insumos, eq(insumos.id, movimientosInventario.insumoId))
        .leftJoin(pedidos, eq(pedidos.id, movimientosInventario.pedidoId))
        .leftJoin(u, eq(u.id, movimientosInventario.usuarioId))
        .where(and(eq(movimientosInventario.sedeId, sedeId), insumoId ? eq(movimientosInventario.insumoId, insumoId) : undefined))
        .orderBy(desc(movimientosInventario.creadoEn))
        .limit(limite)
      return filas.map((f) => ({ ...f, cantidad: Number(f.cantidad), saldoResultante: Number(f.saldoResultante) }))
    },
    async movimientosDePedido(pedidoId) {
      const filas = await db
        .select({ insumoId: movimientosInventario.insumoId, cantidad: movimientosInventario.cantidad, tipo: movimientosInventario.tipo })
        .from(movimientosInventario)
        .where(eq(movimientosInventario.pedidoId, pedidoId))
      return filas.map((f) => ({ ...f, cantidad: Number(f.cantidad) }))
    },
  }
}

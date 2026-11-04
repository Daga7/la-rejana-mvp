import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type {
  ItemPedidoRegistro,
  PedidoRegistro,
  Recorrido,
  RepoPedidos,
  RepoRecorridos,
  RepoSuscripciones,
  SuscripcionPush,
} from '../../../ports/repositorios'
import type { Ejecutor } from '../cliente'
import { pagos, pedidoEventos, pedidoItems, pedidoSuscripciones, pedidos, recorridos, sedes, suscripcionesPush, usuarios } from '../schema'

const dom = alias(usuarios, 'domiciliario')

function consultaBase(db: Ejecutor) {
  return db
    .select({
      p: pedidos,
      sedeNombre: sedes.nombre,
      domiciliarioNombre: dom.nombre,
    })
    .from(pedidos)
    .innerJoin(sedes, eq(sedes.id, pedidos.sedeId))
    .leftJoin(dom, eq(dom.id, pedidos.domiciliarioId))
}

type FilaBase = { p: typeof pedidos.$inferSelect; sedeNombre: string; domiciliarioNombre: string | null }

const aPedido = ({ p, sedeNombre, domiciliarioNombre }: FilaBase): PedidoRegistro => ({
  id: p.id,
  numero: p.numero,
  sedeId: p.sedeId,
  sedeNombre,
  clienteId: p.clienteId,
  estado: p.estado,
  contactoNombre: p.contactoNombre,
  contactoTelefono: p.contactoTelefono,
  direccion: p.direccion,
  direccionDetalle: p.direccionDetalle,
  barrio: p.barrio,
  lat: p.lat,
  lng: p.lng,
  notas: p.notas,
  metodoPago: p.metodoPago,
  pagaCon: p.pagaCon,
  subtotal: p.subtotal,
  costoEnvio: p.costoEnvio,
  total: p.total,
  estadoPago: p.estadoPago,
  domiciliarioId: p.domiciliarioId,
  domiciliarioNombre,
  recorridoId: p.recorridoId,
  tokenSeguimientoHash: p.tokenSeguimientoHash,
  motivoCancelacion: p.motivoCancelacion,
  creadoEn: p.creadoEn,
  actualizadoEn: p.actualizadoEn,
  enCaminoEn: p.enCaminoEn,
  entregadoEn: p.entregadoEn,
  canceladoEn: p.canceladoEn,
  cerradoEn: p.cerradoEn,
})

export function repoPedidos(db: Ejecutor): RepoPedidos {
  const porId = async (id: string) => {
    const [r] = await consultaBase(db).where(eq(pedidos.id, id)).limit(1)
    return r ? aPedido(r) : null
  }
  return {
    async crear(datos, items) {
      const [p] = await db.insert(pedidos).values(datos).returning({ id: pedidos.id })
      await db.insert(pedidoItems).values(items.map((i) => ({ ...i, pedidoId: p!.id })))
      await db.insert(pedidoEventos).values({ pedidoId: p!.id, estado: 'recibido', actorId: datos.clienteId, actorRol: datos.clienteId ? 'cliente' : 'invitado' })
      return (await porId(p!.id))!
    },
    async porId(id, opciones) {
      if (opciones?.bloquear) {
        // Bloquea la fila del pedido durante la transacción (cambios de estado concurrentes).
        await db.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.id, id)).for('update')
      }
      return porId(id)
    },
    async porIdempotencia(clave) {
      const [r] = await consultaBase(db).where(eq(pedidos.claveIdempotencia, clave)).limit(1)
      return r ? aPedido(r) : null
    },
    async listar(f) {
      const filas = await consultaBase(db)
        .where(
          and(
            f.sedeId ? eq(pedidos.sedeId, f.sedeId) : undefined,
            f.estados?.length ? inArray(pedidos.estado, f.estados) : undefined,
            f.clienteId ? eq(pedidos.clienteId, f.clienteId) : undefined,
            f.domiciliarioId ? eq(pedidos.domiciliarioId, f.domiciliarioId) : undefined,
            f.recorridoId ? eq(pedidos.recorridoId, f.recorridoId) : undefined,
            f.desde ? gte(pedidos.creadoEn, f.desde) : undefined,
            f.sinCerrar ? isNull(pedidos.cerradoEn) : undefined,
          ),
        )
        .orderBy(f.clienteId ? desc(pedidos.creadoEn) : asc(pedidos.creadoEn))
        .limit(f.limite ?? 200)
      return filas.map(aPedido)
    },
    async items(pedidoIds) {
      const mapa = new Map<string, ItemPedidoRegistro[]>()
      if (pedidoIds.length === 0) return mapa
      const filas = await db.select().from(pedidoItems).where(inArray(pedidoItems.pedidoId, pedidoIds))
      for (const f of filas) {
        const lista = mapa.get(f.pedidoId) ?? []
        lista.push({ id: f.id, productoId: f.productoId, nombre: f.nombre, precioUnitario: f.precioUnitario, cantidad: f.cantidad, notas: f.notas, subtotal: f.subtotal })
        mapa.set(f.pedidoId, lista)
      }
      return mapa
    },
    async eventos(pedidoId) {
      const filas = await db
        .select({ estado: pedidoEventos.estado, actorRol: pedidoEventos.actorRol, nota: pedidoEventos.nota, creadoEn: pedidoEventos.creadoEn })
        .from(pedidoEventos)
        .where(eq(pedidoEventos.pedidoId, pedidoId))
        .orderBy(asc(pedidoEventos.creadoEn))
      return filas
    },
    async pagos(pedidoId) {
      const filas = await db.select().from(pagos).where(eq(pagos.pedidoId, pedidoId)).orderBy(asc(pagos.creadoEn))
      return filas.map((f) => ({ id: f.id, metodo: f.metodo, monto: f.monto, recibido: f.recibido, cambio: f.cambio, referencia: f.referencia, creadoEn: f.creadoEn }))
    },
    async actualizar(id, cambios) {
      await db
        .update(pedidos)
        .set({ ...cambios, actualizadoEn: new Date() })
        .where(eq(pedidos.id, id))
    },
    async registrarEvento(datos) {
      await db.insert(pedidoEventos).values({ ...datos, nota: datos.nota ?? null })
    },
    async registrarPago(datos) {
      await db.insert(pagos).values(datos)
    },
  }
}

const aRecorrido = (r: typeof recorridos.$inferSelect): Recorrido => ({
  id: r.id,
  sedeId: r.sedeId,
  domiciliarioId: r.domiciliarioId,
  estado: r.estado,
  ordenParadas: r.ordenParadas,
  ultimaLat: r.ultimaLat,
  ultimaLng: r.ultimaLng,
  ultimaUbicacionEn: r.ultimaUbicacionEn,
  iniciadoEn: r.iniciadoEn,
  finalizadoEn: r.finalizadoEn,
})

export function repoRecorridos(db: Ejecutor): RepoRecorridos {
  return {
    async crear(datos) {
      const [r] = await db.insert(recorridos).values(datos).returning()
      return aRecorrido(r!)
    },
    async activoDe(domiciliarioId) {
      const [r] = await db
        .select()
        .from(recorridos)
        .where(and(eq(recorridos.domiciliarioId, domiciliarioId), eq(recorridos.estado, 'activo')))
        .limit(1)
      return r ? aRecorrido(r) : null
    },
    async porId(id) {
      const [r] = await db.select().from(recorridos).where(eq(recorridos.id, id)).limit(1)
      return r ? aRecorrido(r) : null
    },
    async guardarUbicacion(id, lat, lng, fecha) {
      await db
        .update(recorridos)
        .set({ ultimaLat: lat, ultimaLng: lng, ultimaUbicacionEn: fecha })
        .where(and(eq(recorridos.id, id), eq(recorridos.estado, 'activo')))
    },
    async finalizar(id, fecha) {
      await db
        .update(recorridos)
        .set({ estado: 'finalizado', finalizadoEn: fecha, ultimaLat: null, ultimaLng: null, ultimaUbicacionEn: null })
        .where(eq(recorridos.id, id))
    },
  }
}

export function repoSuscripciones(db: Ejecutor): RepoSuscripciones {
  const a = (r: typeof suscripcionesPush.$inferSelect): SuscripcionPush => ({ id: r.id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, usuarioId: r.usuarioId })
  return {
    async guardar(datos) {
      const [r] = await db
        .insert(suscripcionesPush)
        .values(datos)
        .onConflictDoUpdate({
          target: suscripcionesPush.endpoint,
          set: {
            p256dh: datos.p256dh,
            auth: datos.auth,
            // Si la suscripción pasa a un usuario identificado se conserva; nunca se "desasigna" desde un invitado.
            usuarioId: sql`coalesce(${datos.usuarioId}::uuid, ${suscripcionesPush.usuarioId})`,
          },
        })
        .returning()
      return a(r!)
    },
    async vincularPedido(pedidoId, suscripcionId) {
      await db.insert(pedidoSuscripciones).values({ pedidoId, suscripcionId }).onConflictDoNothing()
    },
    async dePedido(pedidoId, clienteId) {
      const vinculadas = await db
        .select({ s: suscripcionesPush })
        .from(pedidoSuscripciones)
        .innerJoin(suscripcionesPush, eq(suscripcionesPush.id, pedidoSuscripciones.suscripcionId))
        .where(eq(pedidoSuscripciones.pedidoId, pedidoId))
      const delCliente = clienteId ? await db.select().from(suscripcionesPush).where(eq(suscripcionesPush.usuarioId, clienteId)) : []
      const unicas = new Map<string, SuscripcionPush>()
      for (const v of vinculadas) unicas.set(v.s.id, a(v.s))
      for (const s of delCliente) unicas.set(s.id, a(s))
      return [...unicas.values()]
    },
    async eliminarPorEndpoint(endpoint) {
      await db.delete(suscripcionesPush).where(eq(suscripcionesPush.endpoint, endpoint))
    },
    async eliminar(id) {
      await db.delete(suscripcionesPush).where(eq(suscripcionesPush.id, id))
    },
  }
}

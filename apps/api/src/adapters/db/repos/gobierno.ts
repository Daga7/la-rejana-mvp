import { and, desc, eq, gte, lt, ne, sql } from 'drizzle-orm'
import type { RepoAuditoria, RepoBuzon, RepoReportes, RepoWhatsapp } from '../../../ports/repositorios'
import type { Ejecutor } from '../cliente'
import { auditoria, buzonMensajes, pedidoItems, pedidos, sedes, usuarios, whatsappMensajes } from '../schema'

export function repoBuzon(db: Ejecutor): RepoBuzon {
  return {
    async crear(datos) {
      const [r] = await db.insert(buzonMensajes).values(datos).returning({ id: buzonMensajes.id })
      return r!
    },
    async listar({ estado }) {
      const filas = await db
        .select({
          id: buzonMensajes.id,
          tipo: buzonMensajes.tipo,
          mensaje: buzonMensajes.mensaje,
          anonimo: buzonMensajes.anonimo,
          autorNombre: usuarios.nombre,
          sedeNombre: sedes.nombre,
          estado: buzonMensajes.estado,
          fecha: buzonMensajes.fecha,
        })
        .from(buzonMensajes)
        .leftJoin(usuarios, eq(usuarios.id, buzonMensajes.autorId))
        .leftJoin(sedes, eq(sedes.id, buzonMensajes.sedeId))
        .where(estado ? eq(buzonMensajes.estado, estado) : undefined)
        // Sin orden por id (aleatorio) ni hora: solo por fecha, para no revelar el orden de envío dentro del día.
        .orderBy(desc(buzonMensajes.fecha), buzonMensajes.id)
        .limit(500)
      return filas
    },
    async cambiarEstado(id, estado, ahora) {
      const filas = await db
        .update(buzonMensajes)
        .set({ estado, actualizadoEn: ahora })
        .where(eq(buzonMensajes.id, id))
        .returning({ id: buzonMensajes.id })
      return filas.length === 1
    },
  }
}

export function repoAuditoria(db: Ejecutor): RepoAuditoria {
  return {
    async registrar(e) {
      await db.insert(auditoria).values({
        actorId: e.actorId,
        actorRol: e.actorRol,
        accion: e.accion,
        entidad: e.entidad,
        entidadId: e.entidadId,
        datos: e.datos ?? null,
        ip: e.ip ?? null,
      })
    },
    async listar({ entidad, limite, antesDe }) {
      const filas = await db
        .select({
          id: auditoria.id,
          actorId: auditoria.actorId,
          actorRol: auditoria.actorRol,
          actorNombre: usuarios.nombre,
          accion: auditoria.accion,
          entidad: auditoria.entidad,
          entidadId: auditoria.entidadId,
          datos: auditoria.datos,
          ip: auditoria.ip,
          creadoEn: auditoria.creadoEn,
        })
        .from(auditoria)
        .leftJoin(usuarios, eq(usuarios.id, auditoria.actorId))
        .where(and(entidad ? eq(auditoria.entidad, entidad) : undefined, antesDe ? lt(auditoria.creadoEn, antesDe) : undefined))
        .orderBy(desc(auditoria.creadoEn))
        .limit(limite)
      return filas
    },
  }
}

export function repoWhatsapp(db: Ejecutor): RepoWhatsapp {
  return {
    async registrarEntrante(wamid, telefono, tipo) {
      const filas = await db.insert(whatsappMensajes).values({ wamid, telefono, tipo }).onConflictDoNothing().returning({ wamid: whatsappMensajes.wamid })
      return filas.length === 1
    },
    async marcar(wamid, estado, ahora) {
      await db.update(whatsappMensajes).set({ estado, procesadoEn: ahora }).where(eq(whatsappMensajes.wamid, wamid))
    },
  }
}

const DIA_BOGOTA = sql<string>`to_char(${pedidos.creadoEn} at time zone 'America/Bogota', 'YYYY-MM-DD')`

export function repoReportes(db: Ejecutor): RepoReportes {
  return {
    async ventasPorDia({ sedeId, desde, hasta }) {
      const filas = await db
        .select({
          dia: DIA_BOGOTA,
          sedeId: pedidos.sedeId,
          pedidos: sql<number>`count(*)::int`,
          ventas: sql<number>`coalesce(sum(${pedidos.total}), 0)::bigint`,
        })
        .from(pedidos)
        .where(and(ne(pedidos.estado, 'cancelado'), gte(pedidos.creadoEn, desde), lt(pedidos.creadoEn, hasta), sedeId ? eq(pedidos.sedeId, sedeId) : undefined))
        .groupBy(DIA_BOGOTA, pedidos.sedeId)
        .orderBy(DIA_BOGOTA)
      return filas.map((f) => ({ ...f, ventas: Number(f.ventas) }))
    },
    async productosMasVendidos({ sedeId, desde, hasta, limite }) {
      const filas = await db
        .select({
          productoId: pedidoItems.productoId,
          nombre: sql<string>`max(${pedidoItems.nombre})`,
          unidades: sql<number>`sum(${pedidoItems.cantidad})::int`,
          ventas: sql<number>`sum(${pedidoItems.subtotal})::bigint`,
        })
        .from(pedidoItems)
        .innerJoin(pedidos, eq(pedidos.id, pedidoItems.pedidoId))
        .where(and(ne(pedidos.estado, 'cancelado'), gte(pedidos.creadoEn, desde), lt(pedidos.creadoEn, hasta), sedeId ? eq(pedidos.sedeId, sedeId) : undefined))
        .groupBy(pedidoItems.productoId)
        .orderBy(sql`sum(${pedidoItems.cantidad}) desc`)
        .limit(limite)
      return filas.map((f) => ({ ...f, ventas: Number(f.ventas) }))
    },
    async pedidosPorEstado({ sedeId, desde, hasta }) {
      const filas = await db
        .select({ estado: pedidos.estado, cantidad: sql<number>`count(*)::int` })
        .from(pedidos)
        .where(and(gte(pedidos.creadoEn, desde), lt(pedidos.creadoEn, hasta), sedeId ? eq(pedidos.sedeId, sedeId) : undefined))
        .groupBy(pedidos.estado)
      return filas
    },
  }
}

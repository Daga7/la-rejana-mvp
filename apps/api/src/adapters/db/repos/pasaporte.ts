import { and, asc, count, desc, eq, gte, inArray, isNull } from 'drizzle-orm'
import type { ConfigPasaporte, PasaporteRegistro, RepoPasaporte } from '../../../ports/repositorios'
import type { Ejecutor } from '../cliente'
import { canjesPasaporte, pasaporteConfig, pasaportes, productos, sedes, sellos, usuarios } from '../schema'

const POR_DEFECTO: ConfigPasaporte = { activo: false, sellosParaPremio: 8, montoMinimo: 20000, premioProductoId: null, premioNombre: null, premioDescripcion: null, vigenciaMeses: 6 }

function consultaPasaporte(db: Ejecutor) {
  return db
    .select({ p: pasaportes, nombre: usuarios.nombre, activo: usuarios.activo })
    .from(pasaportes)
    .innerJoin(usuarios, eq(usuarios.id, pasaportes.clienteId))
}

const aPasaporte = ({ p, nombre, activo }: { p: typeof pasaportes.$inferSelect; nombre: string; activo: boolean }): PasaporteRegistro => ({
  clienteId: p.clienteId,
  clienteNombre: nombre,
  clienteActivo: activo,
  codigo: p.codigo,
  aceptadoEn: p.aceptadoEn,
})

export function repoPasaporte(db: Ejecutor): RepoPasaporte {
  return {
    async config() {
      const [f] = await db
        .select({ c: pasaporteConfig, premioNombre: productos.nombre })
        .from(pasaporteConfig)
        .leftJoin(productos, eq(productos.id, pasaporteConfig.premioProductoId))
        .where(eq(pasaporteConfig.id, 1))
        .limit(1)
      if (!f) return POR_DEFECTO
      const { c } = f
      return { activo: c.activo, sellosParaPremio: c.sellosParaPremio, montoMinimo: c.montoMinimo, premioProductoId: c.premioProductoId, premioNombre: f.premioNombre, premioDescripcion: c.premioDescripcion, vigenciaMeses: c.vigenciaMeses }
    },
    async guardarConfig(c, actorId) {
      const valores = { activo: c.activo, sellosParaPremio: c.sellosParaPremio, montoMinimo: c.montoMinimo, premioProductoId: c.premioProductoId, premioDescripcion: c.premioDescripcion, vigenciaMeses: c.vigenciaMeses, actualizadoPor: actorId, actualizadoEn: new Date() }
      await db
        .insert(pasaporteConfig)
        .values({ id: 1, ...valores })
        .onConflictDoUpdate({ target: pasaporteConfig.id, set: valores })
    },
    async deCliente(clienteId) {
      const [r] = await consultaPasaporte(db).where(eq(pasaportes.clienteId, clienteId)).limit(1)
      return r ? aPasaporte(r) : null
    },
    async porCodigo(codigo) {
      const [r] = await consultaPasaporte(db).where(eq(pasaportes.codigo, codigo)).limit(1)
      return r ? aPasaporte(r) : null
    },
    async inscribir(datos) {
      await db.insert(pasaportes).values(datos)
    },
    async cambiarCodigo(clienteId, codigo) {
      await db.update(pasaportes).set({ codigo }).where(eq(pasaportes.clienteId, clienteId))
    },
    async eliminar(clienteId) {
      await db.update(canjesPasaporte).set({ clienteId: null }).where(eq(canjesPasaporte.clienteId, clienteId))
      await db.delete(sellos).where(eq(sellos.clienteId, clienteId))
      await db.delete(pasaportes).where(eq(pasaportes.clienteId, clienteId))
    },
    async sellosVigentes(clienteId, desde, opciones) {
      const consulta = db
        .select({ id: sellos.id, sedeNombre: sedes.nombre, monto: sellos.monto, creadoEn: sellos.creadoEn })
        .from(sellos)
        .innerJoin(sedes, eq(sedes.id, sellos.sedeId))
        .where(and(eq(sellos.clienteId, clienteId), isNull(sellos.canjeId), desde ? gte(sellos.creadoEn, desde) : undefined))
        .orderBy(asc(sellos.creadoEn))
      return opciones?.bloquear ? consulta.for('update', { of: sellos }) : consulta
    },
    async crearSello(datos) {
      await db.insert(sellos).values(datos)
    },
    async crearCanje(datos) {
      const [c] = await db.insert(canjesPasaporte).values(datos).returning({ id: canjesPasaporte.id })
      return c!.id
    },
    async marcarCanjeados(selloIds, canjeId) {
      if (selloIds.length) await db.update(sellos).set({ canjeId }).where(inArray(sellos.id, selloIds))
    },
    async historial(clienteId, limite) {
      const [ss, cs] = await Promise.all([
        db
          .select({ fecha: sellos.creadoEn, sedeNombre: sedes.nombre, monto: sellos.monto, cuentaId: sellos.cuentaId })
          .from(sellos)
          .innerJoin(sedes, eq(sedes.id, sellos.sedeId))
          .where(eq(sellos.clienteId, clienteId))
          .orderBy(desc(sellos.creadoEn))
          .limit(limite),
        db
          .select({ fecha: canjesPasaporte.creadoEn, sedeNombre: sedes.nombre, premio: canjesPasaporte.premioNombre })
          .from(canjesPasaporte)
          .innerJoin(sedes, eq(sedes.id, canjesPasaporte.sedeId))
          .where(eq(canjesPasaporte.clienteId, clienteId))
          .orderBy(desc(canjesPasaporte.creadoEn))
          .limit(limite),
      ])
      return [
        ...ss.map((x) => ({ tipo: 'sello' as const, fecha: x.fecha, sedeNombre: x.sedeNombre, detalle: x.cuentaId ? 'Compra en la mesa' : 'Pedido a domicilio' })),
        ...cs.map((x) => ({ tipo: 'canje' as const, fecha: x.fecha, sedeNombre: x.sedeNombre, detalle: `Premio: ${x.premio}` })),
      ]
        .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
        .slice(0, limite)
    },
    async estadisticas(desde) {
      const [[i], [s], [c]] = await Promise.all([
        db.select({ n: count() }).from(pasaportes),
        db.select({ n: count() }).from(sellos).where(gte(sellos.creadoEn, desde)),
        db.select({ n: count() }).from(canjesPasaporte).where(gte(canjesPasaporte.creadoEn, desde)),
      ])
      return { inscritos: Number(i?.n ?? 0), sellosMes: Number(s?.n ?? 0), canjesMes: Number(c?.n ?? 0) }
    },
  }
}



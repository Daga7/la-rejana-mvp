import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { CuentaRegistro, MesaRegistro, RepoMesas } from '../../../ports/repositorios'
import type { Ejecutor } from '../cliente'
import { cuentasMesa, mesas, pagos, pedidos, usuarios } from '../schema'

const mesero = alias(usuarios, 'mesero')

const aMesa = (m: typeof mesas.$inferSelect): MesaRegistro => ({
  id: m.id,
  sedeId: m.sedeId,
  numero: m.numero,
  zona: m.zona,
  puestos: m.puestos,
  activa: m.activa,
  x: m.posX,
  y: m.posY,
  ancho: m.ancho,
  alto: m.alto,
  forma: m.forma,
  cuentaUnidaId: m.cuentaUnidaId,
})

/** Del registro a las columnas (posX/posY en la base). */
const aColumnas = ({ x, y, ...resto }: Partial<Omit<MesaRegistro, 'id'>>) => ({ ...resto, ...(x !== undefined ? { posX: x } : {}), ...(y !== undefined ? { posY: y } : {}) })

function consultaCuentas(db: Ejecutor) {
  return db
    .select({ c: cuentasMesa, mesaNumero: mesas.numero, zona: mesas.zona, meseroNombre: mesero.nombre })
    .from(cuentasMesa)
    .innerJoin(mesas, eq(mesas.id, cuentasMesa.mesaId))
    .leftJoin(mesero, eq(mesero.id, cuentasMesa.meseroId))
}

const aCuenta = ({ c, mesaNumero, zona, meseroNombre }: { c: typeof cuentasMesa.$inferSelect; mesaNumero: number; zona: string | null; meseroNombre: string | null }): CuentaRegistro => ({
  id: c.id,
  sedeId: c.sedeId,
  mesaId: c.mesaId,
  mesaNumero,
  zona,
  meseroId: c.meseroId,
  meseroNombre,
  comensales: c.comensales,
  estado: c.estado,
  unidaA: c.unidaA,
  cuentaPedidaEn: c.cuentaPedidaEn,
  propina: c.propina,
  estadoPago: c.estadoPago,
  abiertaEn: c.abiertaEn,
  actualizadoEn: c.actualizadoEn,
  cerradaEn: c.cerradaEn,
})

export function repoMesas(db: Ejecutor): RepoMesas {
  const cuenta = async (id: string) => {
    const [r] = await consultaCuentas(db).where(eq(cuentasMesa.id, id)).limit(1)
    return r ? aCuenta(r) : null
  }
  return {
    async mesas(sedeId, opciones) {
      const filas = await db
        .select()
        .from(mesas)
        .where(and(eq(mesas.sedeId, sedeId), opciones?.incluirInactivas ? undefined : eq(mesas.activa, true)))
        .orderBy(asc(mesas.numero))
      return filas.map(aMesa)
    },
    async mesa(id) {
      const [m] = await db.select().from(mesas).where(eq(mesas.id, id)).limit(1)
      return m ? aMesa(m) : null
    },
    async crearMesa(datos) {
      const { sedeId, numero, ...resto } = datos
      const [m] = await db
        .insert(mesas)
        .values({ sedeId, numero, ...aColumnas(resto) })
        .returning()
      return aMesa(m!)
    },
    async actualizarMesa(id, cambios) {
      await db
        .update(mesas)
        .set({ ...aColumnas(cambios), actualizadoEn: new Date() })
        .where(eq(mesas.id, id))
    },
    async cuentasAbiertas(sedeId) {
      const filas = await consultaCuentas(db)
        .where(and(eq(cuentasMesa.sedeId, sedeId), eq(cuentasMesa.estado, 'abierta')))
        .orderBy(asc(cuentasMesa.abiertaEn))
      return filas.map(aCuenta)
    },
    async cuenta(id, opciones) {
      if (opciones?.bloquear) await db.select({ id: cuentasMesa.id }).from(cuentasMesa).where(eq(cuentasMesa.id, id)).for('update')
      return cuenta(id)
    },
    async cuentaAbiertaDeMesa(mesaId) {
      const [r] = await consultaCuentas(db)
        .where(and(eq(cuentasMesa.mesaId, mesaId), eq(cuentasMesa.estado, 'abierta')))
        .limit(1)
      return r ? aCuenta(r) : null
    },
    async abrirCuenta(datos) {
      const [c] = await db.insert(cuentasMesa).values(datos).returning({ id: cuentasMesa.id })
      return (await cuenta(c!.id))!
    },
    async actualizarCuenta(id, cambios) {
      await db
        .update(cuentasMesa)
        .set({ ...cambios, actualizadoEn: new Date() })
        .where(eq(cuentasMesa.id, id))
    },
    async bloquearMesa(id) {
      await db.select({ id: mesas.id }).from(mesas).where(eq(mesas.id, id)).for('update')
    },
    async unirMesa(mesaId, cuentaId) {
      await db.update(mesas).set({ cuentaUnidaId: cuentaId, actualizadoEn: new Date() }).where(eq(mesas.id, mesaId))
    },
    async mesasUnidas(cuentaIds) {
      if (cuentaIds.length === 0) return []
      const filas = await db.select().from(mesas).where(inArray(mesas.cuentaUnidaId, cuentaIds)).orderBy(asc(mesas.numero))
      return filas.map(aMesa)
    },
    async reasignarUnidas(desde, hacia) {
      await db.update(mesas).set({ cuentaUnidaId: hacia, actualizadoEn: new Date() }).where(eq(mesas.cuentaUnidaId, desde))
    },
    async moverRondas(desde, hacia, desplazamiento) {
      const filas = await db
        .update(pedidos)
        .set({ cuentaId: hacia, ronda: sql`${pedidos.ronda} + ${desplazamiento}`, actualizadoEn: new Date() })
        .where(eq(pedidos.cuentaId, desde))
        .returning({ id: pedidos.id })
      return filas.length
    },
    async moverPagos(desde, hacia) {
      const filas = await db.update(pagos).set({ cuentaId: hacia }).where(eq(pagos.cuentaId, desde)).returning({ id: pagos.id })
      return filas.length
    },
    async siguienteRonda(cuentaId) {
      const [r] = await db
        .select({ n: sql<number>`coalesce(max(${pedidos.ronda}), 0)::int` })
        .from(pedidos)
        .where(eq(pedidos.cuentaId, cuentaId))
      return (r?.n ?? 0) + 1
    },
    async pagos(cuentaId) {
      const filas = await db.select().from(pagos).where(eq(pagos.cuentaId, cuentaId)).orderBy(asc(pagos.creadoEn))
      return filas.map((f) => ({ id: f.id, metodo: f.metodo, monto: f.monto, recibido: f.recibido, cambio: f.cambio, referencia: f.referencia, creadoEn: f.creadoEn }))
    },
    async registrarPago(datos) {
      await db.insert(pagos).values(datos)
    },
  }
}

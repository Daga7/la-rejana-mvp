import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm'
import type { RepoTurnos, TurnoRegistro } from '../../../ports/repositorios'
import type { Ejecutor } from '../cliente'
import { sedes, turnos, usuarios } from '../schema'

function consulta(db: Ejecutor) {
  return db
    .select({ t: turnos, usuarioNombre: usuarios.nombre, rol: usuarios.rol, sedeNombre: sedes.nombre })
    .from(turnos)
    .innerJoin(usuarios, eq(usuarios.id, turnos.usuarioId))
    .innerJoin(sedes, eq(sedes.id, turnos.sedeId))
}

const aTurno = ({ t, usuarioNombre, rol, sedeNombre }: { t: typeof turnos.$inferSelect; usuarioNombre: string; rol: TurnoRegistro['rol']; sedeNombre: string }): TurnoRegistro => ({
  id: t.id,
  usuarioId: t.usuarioId,
  usuarioNombre,
  rol,
  sedeId: t.sedeId,
  sedeNombre,
  entradaEn: t.entradaEn,
  salidaEn: t.salidaEn,
  cerradoPor: t.cerradoPor,
  nota: t.nota,
})

export function repoTurnos(db: Ejecutor): RepoTurnos {
  const porId = async (id: string) => {
    const [r] = await consulta(db).where(eq(turnos.id, id)).limit(1)
    return r ? aTurno(r) : null
  }
  return {
    async abiertoDe(usuarioId) {
      const [r] = await consulta(db)
        .where(and(eq(turnos.usuarioId, usuarioId), isNull(turnos.salidaEn)))
        .limit(1)
      return r ? aTurno(r) : null
    },
    async porId(id, opciones) {
      if (opciones?.bloquear) await db.select({ id: turnos.id }).from(turnos).where(eq(turnos.id, id)).for('update')
      return porId(id)
    },
    async abrir(datos) {
      const [t] = await db.insert(turnos).values(datos).returning({ id: turnos.id })
      return (await porId(t!.id))!
    },
    async cerrar(id, datos) {
      await db.update(turnos).set(datos).where(eq(turnos.id, id))
    },
    async listar(f) {
      const filas = await consulta(db)
        .where(
          and(
            gte(turnos.entradaEn, f.desde),
            lt(turnos.entradaEn, f.hasta),
            f.sedeId ? eq(turnos.sedeId, f.sedeId) : undefined,
            f.usuarioId ? eq(turnos.usuarioId, f.usuarioId) : undefined,
          ),
        )
        .orderBy(asc(turnos.entradaEn))
        .limit(5000)
      return filas.map(aTurno)
    },
  }
}

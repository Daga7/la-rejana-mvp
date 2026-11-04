import { hora, type ReporteTurnosDTO, type TurnoDTO } from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { exigirPermiso, type Actor } from '../domain/permisos'
import { resolverPeriodo } from '../domain/periodos'
import { MINUTOS_TURNO_SOSPECHOSO, minutosTrabajados, resumenPorPersona } from '../domain/turnos'
import type { TurnoRegistro, UnidadDeTrabajo } from '../ports/repositorios'
import type { Logger, Reloj } from '../ports/servicios'
import { auditar, type ContextoSolicitud } from './comun'

export interface DepsTurnos {
  uow: UnidadDeTrabajo
  reloj: Reloj
  log: Logger
}

function esUnicidad(error: unknown): boolean {
  const codigo = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code
  return codigo === '23505'
}

/**
 * Turnos: cada empleado marca su entrada y su salida (la hora la pone el servidor, nunca el celular) y
 * el admin consulta las horas por persona y sede. No es arqueo ni cierre de caja.
 */
export function crearCasosTurnos(d: DepsTurnos) {
  const { uow, reloj } = d

  function aDTO(t: TurnoRegistro): TurnoDTO {
    const minutos = minutosTrabajados(t.entradaEn, t.salidaEn, reloj.ahora())
    return {
      id: t.id,
      usuarioId: t.usuarioId,
      usuarioNombre: t.usuarioNombre,
      rol: t.rol,
      sedeId: t.sedeId,
      sedeNombre: t.sedeNombre,
      entradaEn: t.entradaEn.toISOString(),
      salidaEn: t.salidaEn?.toISOString() ?? null,
      minutos,
      abierto: !t.salidaEn,
      cerradoPorAdmin: !!t.cerradoPor && t.cerradoPor !== t.usuarioId,
      nota: t.nota,
      revisar: minutos > MINUTOS_TURNO_SOSPECHOSO,
    }
  }

  return {
    /** Turno abierto del empleado (o null). */
    async actual(actor: Actor): Promise<TurnoDTO | null> {
      const a = exigirPermiso(actor, 'turnos.marcar')
      const t = await uow.repos.turnos.abiertoDe(a.id)
      return t ? aDTO(t) : null
    },

    async entrada(actor: Actor, ctx: ContextoSolicitud): Promise<TurnoDTO> {
      const a = exigirPermiso(actor, 'turnos.marcar')
      if (!a.sedeId) throw err.validacion('Tu usuario no tiene sede asignada: pídele al administrador que la asigne')
      const previo = await uow.repos.turnos.abiertoDe(a.id)
      if (previo) throw err.conflicto(`Ya marcaste tu entrada a las ${hora(previo.entradaEn)}`)
      try {
        const t = await uow.repos.turnos.abrir({ usuarioId: a.id, sedeId: a.sedeId, entradaEn: reloj.ahora() })
        d.log.info({ turno: t.id, ip: ctx.ip ? 'registrada' : null }, 'Entrada marcada')
        return aDTO(t)
      } catch (error) {
        // Dos toques seguidos: el segundo choca con el índice de un solo turno abierto.
        if (esUnicidad(error)) throw err.conflicto('Ya marcaste tu entrada')
        throw error
      }
    },

    async salida(actor: Actor, ctx: ContextoSolicitud): Promise<TurnoDTO> {
      const a = exigirPermiso(actor, 'turnos.marcar')
      const id = await uow.transaccion(async (repos) => {
        const abierto = await repos.turnos.abiertoDe(a.id)
        if (!abierto) throw err.conflicto('No tienes un turno abierto: marca primero tu entrada')
        const t = await repos.turnos.porId(abierto.id, { bloquear: true })
        if (!t || t.salidaEn) throw err.conflicto('Ese turno ya se cerró')
        const ahora = reloj.ahora()
        // La salida debe quedar después de la entrada aunque se marque en el mismo segundo.
        const salidaEn = ahora > t.entradaEn ? ahora : new Date(t.entradaEn.getTime() + 1000)
        await repos.turnos.cerrar(t.id, { salidaEn, cerradoPor: a.id, nota: null })
        return t.id
      })
      d.log.info({ turno: id, ip: ctx.ip ? 'registrada' : null }, 'Salida marcada')
      return aDTO((await uow.repos.turnos.porId(id))!)
    },

    /** Turnos de un periodo (por fecha de entrada, en hora de Bogotá) con las horas por persona. */
    async reporte(actor: Actor, filtro: { sedeId?: string | undefined; periodo: Parameters<typeof resolverPeriodo>[0]['periodo'] }): Promise<ReporteTurnosDTO> {
      exigirPermiso(actor, 'turnos.gestionar')
      const rango = resolverPeriodo({ periodo: filtro.periodo }, reloj.ahora())
      const lista = (await uow.repos.turnos.listar({ desde: rango.desde, hasta: rango.hasta, ...(filtro.sedeId ? { sedeId: filtro.sedeId } : {}) })).map(aDTO)
      return { etiqueta: rango.etiqueta, desde: rango.diaDesde, hasta: rango.diaHasta, turnos: lista, resumen: resumenPorPersona(lista) }
    },

    /** El admin cierra un turno olvidado con la hora real de salida; queda quién lo hizo y por qué. */
    async cerrarPorAdmin(actor: Actor, id: string, e: { salidaEn: string; nota: string }, ctx: ContextoSolicitud): Promise<TurnoDTO> {
      const a = exigirPermiso(actor, 'turnos.gestionar')
      const salida = new Date(e.salidaEn)
      await uow.transaccion(async (repos) => {
        const t = await repos.turnos.porId(id, { bloquear: true })
        if (!t) throw err.noEncontrado('Ese turno no existe')
        if (t.salidaEn) throw err.conflicto('Ese turno ya tiene hora de salida')
        if (salida <= t.entradaEn) throw new ErrorDominio('VALIDACION', 'La salida debe ser después de la entrada', { campo: 'salidaEn' })
        if (salida > reloj.ahora()) throw new ErrorDominio('VALIDACION', 'La salida no puede quedar en el futuro', { campo: 'salidaEn' })
        await repos.turnos.cerrar(t.id, { salidaEn: salida, cerradoPor: a.id, nota: e.nota })
        await auditar(repos, a, 'turno.cerrar', 'turno', t.id, { usuarioId: t.usuarioId, entrada: t.entradaEn.toISOString(), salida: salida.toISOString(), nota: e.nota }, ctx.ip)
      })
      return aDTO((await uow.repos.turnos.porId(id))!)
    },
  }
}

export type CasosTurnos = ReturnType<typeof crearCasosTurnos>

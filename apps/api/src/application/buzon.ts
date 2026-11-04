import { diaBogota, type BuzonMensajeDTO, type EstadoBuzon, type TipoBuzon } from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { exigirPermiso, type Actor } from '../domain/permisos'
import type { UnidadDeTrabajo } from '../ports/repositorios'
import type { Reloj } from '../ports/servicios'
import { auditar, type ContextoSolicitud } from './comun'

const MAX_POR_HORA = 5

/**
 * Buzón de quejas y sugerencias del equipo.
 * Anonimato real: si el mensaje es anónimo no se guarda autor, sede ni hora (solo la fecha), no se
 * audita y no se registra en logs. El límite de envíos vive solo en memoria y se pierde al reiniciar.
 */
export function crearCasosBuzon(d: { uow: UnidadDeTrabajo; reloj: Reloj }) {
  const { uow, reloj } = d
  const envios = new Map<string, number[]>()

  function controlarLimite(clave: string) {
    const ahora = reloj.ahora().getTime()
    const recientes = (envios.get(clave) ?? []).filter((t) => ahora - t < 3_600_000)
    if (recientes.length >= MAX_POR_HORA) throw new ErrorDominio('DEMASIADOS_INTENTOS', 'Enviaste varios mensajes seguidos. Inténtalo más tarde.')
    recientes.push(ahora)
    envios.set(clave, recientes)
  }

  return {
    async enviar(actor: Actor, e: { tipo: TipoBuzon; mensaje: string; anonimo: boolean }) {
      const a = exigirPermiso(actor, 'buzon.enviar')
      controlarLimite(a.id)
      const fecha = diaBogota(reloj.ahora())
      await uow.repos.buzon.crear({
        tipo: e.tipo,
        mensaje: e.mensaje,
        anonimo: e.anonimo,
        autorId: e.anonimo ? null : a.id,
        sedeId: e.anonimo ? null : a.sedeId,
        fecha,
      })
      // Intencionalmente no se devuelve el id ni se audita: nada que permita rastrear el envío.
      return { recibido: true }
    },

    async listar(actor: Actor, estado?: EstadoBuzon): Promise<BuzonMensajeDTO[]> {
      exigirPermiso(actor, 'buzon.leer')
      return uow.repos.buzon.listar({ estado })
    },

    async cambiarEstado(actor: Actor, id: string, estado: EstadoBuzon, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'buzon.leer')
      if (!(await uow.repos.buzon.cambiarEstado(id, estado, reloj.ahora()))) throw err.noEncontrado('El mensaje no existe')
      await auditar(uow.repos, actor, 'buzon.estado', 'buzon', id, { estado }, ctx.ip)
    },
  }
}

export type CasosBuzon = ReturnType<typeof crearCasosBuzon>

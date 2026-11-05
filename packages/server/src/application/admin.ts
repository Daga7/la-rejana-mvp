import type { RolEmpleado } from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { exigirPermiso, type Actor } from '../domain/permisos'
import type { UnidadDeTrabajo } from '../ports/repositorios'
import type { Reloj } from '../ports/servicios'
import { auditar, type ContextoSolicitud } from './comun'

export function crearCasosAdmin(d: { uow: UnidadDeTrabajo; reloj: Reloj }) {
  const { uow, reloj } = d

  return {
    async empleados(actor: Actor) {
      exigirPermiso(actor, 'empleados.gestionar')
      const [lista, sedes] = await Promise.all([uow.repos.usuarios.empleados({}), uow.repos.sedes.todas(false)])
      const nombre = new Map(sedes.map((s) => [s.id, s.nombre]))
      return lista.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        correo: u.email,
        telefono: u.telefono,
        rol: u.rol as RolEmpleado,
        sedeId: u.sedeId,
        sedeNombre: u.sedeId ? (nombre.get(u.sedeId) ?? null) : null,
        activo: u.activo,
        whatsappHabilitado: u.whatsappHabilitado,
        ultimoIngresoEn: u.ultimoIngresoEn?.toISOString() ?? null,
      }))
    },

    /**
     * Cambia rol, sede, estado o datos de contacto de un empleado. Si cambia algo que afecta sus
     * permisos, se cierran sus sesiones para que el cambio aplique de inmediato.
     */
    async actualizarEmpleado(
      actor: Actor,
      id: string,
      e: { rol?: RolEmpleado; sedeId?: string | null; activo?: boolean; telefono?: string | null; whatsappHabilitado?: boolean },
      ctx: ContextoSolicitud,
    ) {
      const admin = exigirPermiso(actor, 'empleados.gestionar')
      const u = await uow.repos.usuarios.porId(id)
      if (!u || u.rol === 'cliente') throw err.noEncontrado('El empleado no existe')
      if (id === admin.id && (e.activo === false || (e.rol && e.rol !== 'admin'))) {
        throw err.validacion('No puedes desactivarte ni quitarte el rol de administrador a ti mismo')
      }
      const rol = e.rol ?? (u.rol as RolEmpleado)
      const sedeId = rol === 'admin' ? null : e.sedeId !== undefined ? e.sedeId : u.sedeId
      if (rol !== 'admin' && !sedeId) throw err.validacion('Elige la sede del empleado', { campo: 'sedeId' })
      if (sedeId && !(await uow.repos.sedes.porId(sedeId))) throw err.noEncontrado('La sede no existe')
      const telefono = e.telefono !== undefined ? e.telefono : u.telefono
      const whatsapp = e.whatsappHabilitado ?? u.whatsappHabilitado
      if (whatsapp && (rol !== 'admin' || !telefono)) {
        throw new ErrorDominio('VALIDACION', 'El asistente de WhatsApp solo se habilita para administradores con celular registrado', { campo: 'whatsappHabilitado' })
      }
      if (u.rol === 'admin' && (rol !== 'admin' || e.activo === false) && (await uow.repos.usuarios.contarAdminsActivos()) <= 1) {
        throw err.validacion('Debe quedar al menos un administrador activo')
      }
      const cambiaPermisos = rol !== u.rol || sedeId !== u.sedeId || (e.activo !== undefined && e.activo !== u.activo)
      const actualizado = await uow.transaccion(async (repos) => {
        const nuevo = await repos.usuarios.actualizar(id, { rol, sedeId, telefono, whatsappHabilitado: rol === 'admin' ? whatsapp : false, ...(e.activo !== undefined ? { activo: e.activo } : {}) })
        if (cambiaPermisos) await repos.sesiones.revocarTodas(id, 'cambio_permisos', reloj.ahora())
        await auditar(
          repos,
          actor,
          'empleado.actualizar',
          'usuario',
          id,
          { antes: { rol: u.rol, sedeId: u.sedeId, activo: u.activo, whatsappHabilitado: u.whatsappHabilitado }, despues: { rol, sedeId, activo: nuevo.activo, whatsappHabilitado: nuevo.whatsappHabilitado } },
          ctx.ip,
        )
        return nuevo
      })
      return { id: actualizado.id, rol: actualizado.rol, sedeId: actualizado.sedeId, activo: actualizado.activo, whatsappHabilitado: actualizado.whatsappHabilitado, sesionesCerradas: cambiaPermisos }
    },

    async auditoria(actor: Actor, filtro: { entidad?: string; antesDe?: Date }) {
      exigirPermiso(actor, 'auditoria.ver')
      const filas = await uow.repos.auditoria.listar({ entidad: filtro.entidad, antesDe: filtro.antesDe, limite: 100 })
      return filas.map((f) => ({ ...f, creadoEn: f.creadoEn.toISOString() }))
    },
  }
}

export type CasosAdmin = ReturnType<typeof crearCasosAdmin>

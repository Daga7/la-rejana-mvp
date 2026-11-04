import type { UsuarioDTO } from '@rejana/shared'
import type { Actor } from '../domain/permisos'
import type { Repositorios, Usuario } from '../ports/repositorios'
import type { Logger, MensajeCorreo, ServicioCorreo } from '../ports/servicios'

export interface ContextoSolicitud {
  ip: string | null
  userAgent: string | null
}

export async function usuarioDTO(repos: Repositorios, u: Usuario): Promise<UsuarioDTO> {
  const identidades = await repos.identidades.deUsuario(u.id)
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.email,
    rol: u.rol,
    sedeId: u.sedeId,
    telefono: u.telefono,
    correoVerificado: !!u.emailVerificadoEn,
    tieneClave: !!u.passwordHash,
    proveedores: [...new Set(identidades.map((i) => i.proveedor))],
  }
}

/** Registro de auditoría de acciones administrativas y eventos de seguridad. */
export async function auditar(
  repos: Repositorios,
  actor: Actor,
  accion: string,
  entidad: string,
  entidadId: string | null,
  datos?: Record<string, unknown> | null,
  ip?: string | null,
) {
  await repos.auditoria.registrar({
    actorId: actor.tipo === 'usuario' ? actor.id : null,
    actorRol: actor.tipo === 'usuario' ? actor.rol : actor.tipo,
    accion,
    entidad,
    entidadId,
    datos: datos ?? null,
    ip: ip ?? null,
  })
}

/** Envía un correo sin bloquear la respuesta (los endpoints con respuesta genérica no deben delatar nada por el tiempo). */
export function enviarEnSegundoPlano(correo: ServicioCorreo, log: Logger, mensaje: MensajeCorreo) {
  void correo.enviar(mensaje).catch((e: unknown) => log.error({ err: (e as Error).message, asunto: mensaje.asunto }, 'No se pudo enviar un correo'))
}

/** Solo rutas internas relativas (evita redirecciones abiertas). */
export function rutaSegura(ruta: string | null | undefined): string {
  if (!ruta || !ruta.startsWith('/') || ruta.startsWith('//') || ruta.includes('\\') || ruta.length > 200) return ''
  return ruta
}

import { INICIO_ROL, type Rol } from '@rejana/shared'

/** Solo rutas internas (evita redirecciones abiertas con ?volver=). */
export function rutaInterna(ruta: string | null | undefined): string | null {
  if (!ruta || !ruta.startsWith('/') || ruta.startsWith('//') || ruta.includes('\\')) return null
  return ruta
}

export function destinoTrasIngreso(rol: Rol, volver?: string | null): string {
  const v = rutaInterna(volver)
  // Un empleado siempre va a su módulo; un cliente puede volver a donde estaba (p. ej. el carrito).
  if (rol !== 'cliente') return INICIO_ROL[rol]
  return v ?? INICIO_ROL[rol]
}

export const MENSAJES_ERROR_OAUTH: Record<string, string> = {
  SERVICIO_NO_DISPONIBLE: 'El inicio con Google o Apple aún no está configurado. Entra con tu correo y contraseña.',
  TOKEN_INVALIDO: 'La solicitud expiró o no es válida. Inténtalo de nuevo.',
  PROHIBIDO: 'Esa cuenta no coincide con la invitación. Usa el mismo correo al que te llegó.',
  NO_AUTENTICADO: 'No se completó el inicio de sesión.',
  CUENTA_INACTIVA: 'Tu cuenta está desactivada. Habla con el administrador.',
  CONFLICTO: 'Ya existe una cuenta con ese correo. Inicia sesión con tu contraseña.',
}

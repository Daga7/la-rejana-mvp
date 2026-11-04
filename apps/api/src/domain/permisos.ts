import type { EstadoPedido, Rol } from '@rejana/shared'
import { ErrorDominio, err } from './errores'

/** Quién ejecuta un caso de uso. Lo construye el adaptador HTTP a partir de la sesión verificada. */
export type Actor =
  | { tipo: 'usuario'; id: string; rol: Rol; sedeId: string | null; sesionId: string }
  | { tipo: 'invitado' }
  | { tipo: 'sistema' }

export type ActorUsuario = Extract<Actor, { tipo: 'usuario' }>

export type Permiso =
  | 'sedes.gestionar'
  | 'menu.gestionar'
  | 'inventario.gestionar'
  | 'inventario.ver'
  | 'empleados.gestionar'
  | 'reportes.ver'
  | 'auditoria.ver'
  | 'buzon.leer'
  | 'buzon.enviar'
  | 'pedidos.ver_sede'
  | 'pedidos.cocinar'
  | 'pedidos.despachar'
  | 'pedidos.cobrar'
  | 'pedidos.cancelar'
  | 'pedidos.entregar'
  | 'domicilios.recorrer'
  | 'cliente.pedir'

const PERMISOS_POR_ROL: Record<Rol, ReadonlySet<Permiso>> = {
  cliente: new Set(['cliente.pedir']),
  mesero: new Set(['buzon.enviar']),
  cocina: new Set(['buzon.enviar', 'pedidos.ver_sede', 'pedidos.cocinar', 'inventario.ver']),
  caja: new Set(['buzon.enviar', 'pedidos.ver_sede', 'pedidos.despachar', 'pedidos.cobrar', 'pedidos.cancelar', 'pedidos.entregar', 'inventario.ver']),
  domiciliario: new Set(['buzon.enviar', 'domicilios.recorrer', 'pedidos.entregar']),
  admin: new Set([
    'sedes.gestionar',
    'menu.gestionar',
    'inventario.gestionar',
    'inventario.ver',
    'empleados.gestionar',
    'reportes.ver',
    'auditoria.ver',
    'buzon.leer',
    'buzon.enviar',
    'pedidos.ver_sede',
    'pedidos.cocinar',
    'pedidos.despachar',
    'pedidos.cobrar',
    'pedidos.cancelar',
    'pedidos.entregar',
  ]),
}

export function tienePermiso(actor: Actor, permiso: Permiso): boolean {
  if (actor.tipo === 'sistema') return true
  if (actor.tipo !== 'usuario') return false
  return PERMISOS_POR_ROL[actor.rol].has(permiso)
}

export function exigirUsuario(actor: Actor): ActorUsuario {
  if (actor.tipo !== 'usuario') throw err.noAutenticado()
  return actor
}

/** Exige el permiso y devuelve el actor como usuario. */
export function exigirPermiso(actor: Actor, permiso: Permiso): ActorUsuario {
  const u = exigirUsuario(actor)
  if (!tienePermiso(u, permiso)) throw err.prohibido()
  return u
}

/** El admin opera en todas las sedes; los demás empleados solo en la suya. */
export function puedeOperarSede(actor: Actor, sedeId: string): boolean {
  if (actor.tipo === 'sistema') return true
  if (actor.tipo !== 'usuario') return false
  if (actor.rol === 'admin') return true
  if (actor.rol === 'cliente') return false
  return actor.sedeId === sedeId
}

export function exigirSede(actor: Actor, sedeId: string): void {
  if (!puedeOperarSede(actor, sedeId)) throw new ErrorDominio('PROHIBIDO', 'Solo puedes operar en tu sede')
}

/** Permiso requerido para cada transición válida del pedido. */
const TRANSICIONES: Record<EstadoPedido, Partial<Record<EstadoPedido, Permiso>>> = {
  recibido: { en_preparacion: 'pedidos.cocinar', cancelado: 'pedidos.cancelar' },
  en_preparacion: { listo: 'pedidos.cocinar', cancelado: 'pedidos.cancelar' },
  listo: { en_camino: 'pedidos.despachar', cancelado: 'pedidos.cancelar' },
  en_camino: { entregado: 'pedidos.entregar', cancelado: 'pedidos.cancelar' },
  entregado: {},
  cancelado: {},
}

export function permisoTransicion(desde: EstadoPedido, hacia: EstadoPedido): Permiso | null {
  return TRANSICIONES[desde][hacia] ?? null
}

export function transicionesPosibles(desde: EstadoPedido): EstadoPedido[] {
  return Object.keys(TRANSICIONES[desde]) as EstadoPedido[]
}

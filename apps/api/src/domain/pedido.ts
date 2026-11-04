import type { EstadoPedido, MetodoPago } from '@rejana/shared'
import { ErrorDominio } from './errores'
import { permisoTransicion, tienePermiso, type Actor } from './permisos'

export interface LineaCalculada {
  productoId: string
  nombre: string
  precioUnitario: number
  cantidad: number
  notas: string | null
  subtotal: number
}

export interface Totales {
  subtotal: number
  costoEnvio: number
  total: number
}

export function calcularTotales(lineas: Pick<LineaCalculada, 'precioUnitario' | 'cantidad'>[], costoEnvio: number): Totales {
  const subtotal = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0)
  return { subtotal, costoEnvio, total: subtotal + costoEnvio }
}

/** Valida el "paga con" del efectivo: debe cubrir el total. */
export function validarPago(metodo: MetodoPago, total: number, pagaCon: number | undefined): number | null {
  if (metodo !== 'efectivo' || pagaCon === undefined || pagaCon === 0) return null
  if (pagaCon < total) throw new ErrorDominio('VALIDACION', 'El valor con el que pagas debe cubrir el total del pedido', { campo: 'pagaCon' })
  return pagaCon
}

/**
 * Verifica que la transición exista y que el actor tenga el permiso de rol correspondiente.
 * La validación de sede y de "pedido asignado" se hace en el caso de uso.
 */
export function validarTransicion(actor: Actor, desde: EstadoPedido, hacia: EstadoPedido): void {
  const permiso = permisoTransicion(desde, hacia)
  if (!permiso) {
    throw new ErrorDominio('TRANSICION_INVALIDA', `Un pedido "${desde.replace('_', ' ')}" no puede pasar a "${hacia.replace('_', ' ')}"`)
  }
  if (!tienePermiso(actor, permiso)) throw new ErrorDominio('PROHIBIDO', 'Tu rol no puede hacer este cambio de estado')
}

/**
 * ¿Se devuelven los insumos al cancelar? Si la comida no se alcanzó a preparar, sí.
 * Si ya estaba lista o en camino, los insumos se consumieron (salvo que la caja diga lo contrario).
 */
export function reponerPorDefecto(estado: EstadoPedido): boolean {
  return estado === 'recibido' || estado === 'en_preparacion'
}

/** El cliente solo puede cancelar mientras el pedido no ha entrado a la cocina. */
export function clientePuedeCancelar(estado: EstadoPedido): boolean {
  return estado === 'recibido'
}

export function puedeCerrarse(estado: EstadoPedido, estadoPago: 'pendiente' | 'pagado'): boolean {
  return estado === 'entregado' && estadoPago === 'pagado'
}

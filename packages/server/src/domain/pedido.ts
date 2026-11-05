import { propinaSugerida, type CanalPedido, type EstadoMesa, type EstadoPedido, type MetodoPago } from '@rejana/shared'
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
export function validarTransicion(actor: Actor, desde: EstadoPedido, hacia: EstadoPedido, canal: CanalPedido = 'domicilio'): void {
  const permiso = permisoTransicion(desde, hacia, canal)
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

export const esDomicilio = <T extends { canal: CanalPedido }>(p: T): p is Extract<T, { canal: 'domicilio' }> => p.canal === 'domicilio'
export const esMesa = <T extends { canal: CanalPedido }>(p: T): p is Extract<T, { canal: 'mesa' }> => p.canal === 'mesa'

// --- Mesas --------------------------------------------------------------------------------

/** El mesero puede cancelar su ronda (p. ej., se equivocó) mientras la cocina no la ha empezado. */
export function meseroPuedeCancelar(estado: EstadoPedido): boolean {
  return estado === 'recibido'
}

interface RondaResumen {
  estado: EstadoPedido
  total: number
}

const activa = (r: RondaResumen) => r.estado !== 'cancelado'

/** Lo que se cobra: las rondas que no se cancelaron. */
export function subtotalCuenta(rondas: RondaResumen[]): number {
  return rondas.filter(activa).reduce((s, r) => s + r.total, 0)
}

/** Rondas que siguen en la cocina o esperando que el mesero las sirva. */
export function rondasSinServir(rondas: RondaResumen[]): number {
  return rondas.filter((r) => r.estado === 'recibido' || r.estado === 'en_preparacion' || r.estado === 'listo').length
}

/** Cómo se pinta la mesa en el salón. */
export function estadoDeMesa(cuenta: { cuentaPedidaEn: Date | null } | null, rondas: RondaResumen[]): EstadoMesa {
  if (!cuenta) return 'libre'
  if (cuenta.cuentaPedidaEn) return 'por_cobrar'
  if (rondas.some((r) => r.estado === 'listo')) return 'para_servir'
  return 'ocupada'
}

export interface PagoMesa {
  metodo: MetodoPago
  monto: number
  recibido?: number | undefined
  referencia?: string | undefined
}

/**
 * Valida el cobro de una mesa: la propina es 0 o el 10 % del consumo, los pagos deben sumar exactamente
 * el consumo más la propina y el efectivo recibido debe cubrir su monto. Devuelve cada pago con su cambio.
 */
export function validarCobroMesa(pagos: PagoMesa[], subtotal: number, propina: number) {
  if (subtotal <= 0) throw new ErrorDominio('VALIDACION', 'La cuenta está en cero: no hay nada que cobrar')
  // La propina es voluntaria y, si la mesa la acepta, es exactamente el 10 % del consumo (redondeado a la centena).
  const sugerida = propinaSugerida(subtotal)
  if (propina !== 0 && propina !== sugerida) {
    throw new ErrorDominio('VALIDACION', `La propina es voluntaria: 0 o el 10 % del consumo (${sugerida})`, { campo: 'propina', sugerida })
  }
  const total = subtotal + propina
  const suma = pagos.reduce((s, p) => s + p.monto, 0)
  if (suma !== total) {
    throw new ErrorDominio('VALIDACION', `Los pagos suman ${suma} y la cuenta es de ${total}`, { suma, total })
  }
  return pagos.map((p) => {
    if (p.metodo !== 'efectivo' || p.recibido === undefined) return { ...p, recibido: null, cambio: null }
    if (p.recibido < p.monto) throw new ErrorDominio('VALIDACION', 'El efectivo recibido no alcanza para el monto', { campo: 'recibido' })
    return { ...p, recibido: p.recibido, cambio: p.recibido - p.monto }
  })
}

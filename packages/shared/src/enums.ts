// Vocabulario del negocio compartido entre la API y la web.

export const ROLES = ['cliente', 'mesero', 'cocina', 'caja', 'domiciliario', 'admin'] as const
export type Rol = (typeof ROLES)[number]

/** Roles que se asignan por invitación (todos menos cliente). */
export const ROLES_EMPLEADO = ['mesero', 'cocina', 'caja', 'domiciliario', 'admin'] as const
export type RolEmpleado = (typeof ROLES_EMPLEADO)[number]

export const NOMBRE_ROL: Record<Rol, string> = {
  cliente: 'Cliente',
  mesero: 'Mesero',
  cocina: 'Cocina',
  caja: 'Caja',
  domiciliario: 'Domiciliario',
  admin: 'Administrador',
}

/** Pantalla de inicio de cada rol después de iniciar sesión. */
export const INICIO_ROL: Record<Rol, string> = {
  cliente: '/menu',
  mesero: '/mesero',
  cocina: '/cocina',
  caja: '/caja',
  domiciliario: '/domiciliario',
  admin: '/admin',
}

export const ESTADOS_PEDIDO = ['recibido', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'] as const
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number]

export const NOMBRE_ESTADO: Record<EstadoPedido, string> = {
  recibido: 'Recibido',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

/** Orden lineal del flujo feliz (cancelado queda por fuera). */
export const FLUJO_PEDIDO: EstadoPedido[] = ['recibido', 'en_preparacion', 'listo', 'en_camino', 'entregado']

/** Canal del pedido: domicilio (cliente) o mesa (lo toma el mesero en el restaurante). */
export const CANALES_PEDIDO = ['domicilio', 'mesa'] as const
export type CanalPedido = (typeof CANALES_PEDIDO)[number]

/** En la mesa el último paso no es "entregado" sino "servido". */
export const NOMBRE_ESTADO_MESA_RONDA: Record<EstadoPedido, string> = {
  recibido: 'En cola',
  en_preparacion: 'En la parrilla',
  listo: '¡Lista! Servir',
  en_camino: 'En camino',
  entregado: 'Servida',
  cancelado: 'Cancelada',
}

/** Forma de la mesa en el plano del salón. */
export const FORMAS_MESA = ['cuadrada', 'redonda', 'rectangular'] as const
export type FormaMesa = (typeof FORMAS_MESA)[number]
export const NOMBRE_FORMA_MESA: Record<FormaMesa, string> = { cuadrada: 'Cuadrada', redonda: 'Redonda', rectangular: 'Rectangular' }

/** El plano de cada zona es una cuadrícula de hasta 24 × 24 casillas. */
export const PLANO_MAX = 24

/** Cuenta de una mesa: agrupa las rondas que el mesero envía a la cocina hasta que se cobra. «unida»: se fundió en otra cuenta. */
export const ESTADOS_CUENTA = ['abierta', 'cerrada', 'cancelada', 'unida'] as const
export type EstadoCuenta = (typeof ESTADOS_CUENTA)[number]

/** Cómo se ve una mesa en el salón. */
export const ESTADOS_MESA = ['libre', 'ocupada', 'para_servir', 'por_cobrar'] as const
export type EstadoMesa = (typeof ESTADOS_MESA)[number]
export const NOMBRE_ESTADO_MESA: Record<EstadoMesa, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  para_servir: 'Listo para servir',
  por_cobrar: 'Pidió la cuenta',
}

export const METODOS_PAGO = ['efectivo', 'qr'] as const
export type MetodoPago = (typeof METODOS_PAGO)[number]
export const NOMBRE_METODO_PAGO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo contra entrega',
  qr: 'QR del restaurante',
}

export const ESTADOS_PAGO = ['pendiente', 'pagado'] as const
export type EstadoPago = (typeof ESTADOS_PAGO)[number]

export const UNIDADES = ['g', 'ml', 'und'] as const
export type Unidad = (typeof UNIDADES)[number]
export const NOMBRE_UNIDAD: Record<Unidad, string> = { g: 'gramos', ml: 'mililitros', und: 'unidades' }

export const TIPOS_MOVIMIENTO = ['consumo_pedido', 'reposicion_cancelacion', 'ajuste_manual', 'entrada'] as const
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

export const TIPOS_BUZON = ['queja', 'sugerencia'] as const
export type TipoBuzon = (typeof TIPOS_BUZON)[number]

export const ESTADOS_BUZON = ['nueva', 'en_revision', 'resuelta'] as const
export type EstadoBuzon = (typeof ESTADOS_BUZON)[number]
export const NOMBRE_ESTADO_BUZON: Record<EstadoBuzon, string> = {
  nueva: 'Nueva',
  en_revision: 'En revisión',
  resuelta: 'Resuelta',
}

export const PROVEEDORES_OAUTH = ['google', 'apple'] as const
export type ProveedorOAuth = (typeof PROVEEDORES_OAUTH)[number]

/** Catálogo cerrado de reportes (asistente de WhatsApp y tablero). */
export const TIPOS_REPORTE = ['ventas', 'productos_mas_vendidos', 'inventario'] as const
export type TipoReporte = (typeof TIPOS_REPORTE)[number]

export const PERIODOS_REPORTE = ['hoy', 'ayer', 'esta_semana', 'semana_pasada', 'este_mes', 'mes_pasado', 'ultimos_7_dias', 'ultimos_30_dias'] as const
export type PeriodoReporte = (typeof PERIODOS_REPORTE)[number]

export const VERSION_PRIVACIDAD = '2026-11-01'

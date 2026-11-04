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

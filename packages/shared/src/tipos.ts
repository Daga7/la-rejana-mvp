import type {
  EstadoBuzon,
  EstadoPago,
  EstadoPedido,
  MetodoPago,
  ProveedorOAuth,
  Rol,
  TipoBuzon,
  TipoMovimiento,
  Unidad,
} from './enums'

// Formas de las respuestas de la API (contrato entre back y front).

export interface UsuarioDTO {
  id: string
  nombre: string
  correo: string
  rol: Rol
  sedeId: string | null
  telefono: string | null
  correoVerificado: boolean
  tieneClave: boolean
  proveedores: ProveedorOAuth[]
}

export interface SedePublicaDTO {
  id: string
  slug: string
  nombre: string
  direccion: string
  barrio: string
  telefono: string
  lat: number
  lng: number
  horaApertura: string
  horaCierre: string
  abierta: boolean
  tarifaDomicilio: number
  minutosPreparacion: number
  limiteMinutosEntrega: number
  radioEntregaKm: number
  qrPagoUrl: string | null
  qrPagoInstrucciones: string | null
}

export interface ProductoMenuDTO {
  id: string
  nombre: string
  slug: string
  descripcion: string
  imagenUrl: string | null
  precio: number
  /** Interruptor manual de la sede. */
  disponible: boolean
  /** true si no hay stock para preparar al menos 1 unidad o si está apagado. */
  agotado: boolean
  /** Unidades que alcanzan con el inventario actual (null = sin receta, no limitado). */
  maxUnidades: number | null
}

export interface CategoriaMenuDTO {
  id: string
  nombre: string
  slug: string
  productos: ProductoMenuDTO[]
}

export interface MenuDTO {
  sede: SedePublicaDTO
  categorias: CategoriaMenuDTO[]
  generadoEn: string
}

export interface ItemPedidoDTO {
  id: string
  productoId: string
  nombre: string
  precioUnitario: number
  cantidad: number
  notas: string | null
  subtotal: number
}

export interface EventoPedidoDTO {
  estado: EstadoPedido
  fecha: string
  nota: string | null
}

export interface PedidoDTO {
  id: string
  numero: number
  sedeId: string
  sedeNombre: string
  estado: EstadoPedido
  contactoNombre: string
  contactoTelefono: string
  direccion: string
  direccionDetalle: string | null
  barrio: string | null
  lat: number
  lng: number
  notas: string | null
  metodoPago: MetodoPago
  pagaCon: number | null
  subtotal: number
  costoEnvio: number
  total: number
  estadoPago: EstadoPago
  domiciliarioId: string | null
  domiciliarioNombre: string | null
  recorridoId: string | null
  esInvitado: boolean
  items: ItemPedidoDTO[]
  eventos: EventoPedidoDTO[]
  motivoCancelacion: string | null
  creadoEn: string
  actualizadoEn: string
  entregadoEn: string | null
  cerradoEn: string | null
  /** Minutos estimados de llegada (solo mientras va en camino). */
  etaMinutos: number | null
}

export interface PedidoCreadoDTO {
  pedido: PedidoDTO
  /** Solo para invitados: credencial para consultar el pedido. Se entrega una única vez. */
  tokenSeguimiento: string | null
}

export interface UbicacionEnVivoDTO {
  pedidoId: string
  lat: number
  lng: number
  etaMinutos: number | null
  fecha: string
}

export interface ParadaRutaDTO {
  pedidoId: string
  numero: number
  lat: number
  lng: number
  direccion: string
  minutosLlegada: number
  excedeLimite: boolean
}

export interface SalidaRutaDTO {
  paradas: ParadaRutaDTO[]
  minutosTotales: number
  cumpleLimite: boolean
  enlaceGoogleMaps: string
  enlaceWaze: string
}

export interface PlanRutaDTO {
  limiteMinutos: number
  salidas: SalidaRutaDTO[]
  /** true cuando el plan sugiere dividir los pedidos en varias salidas. */
  dividir: boolean
  mensaje: string
}

export interface InsumoDTO {
  id: string
  nombre: string
  unidad: Unidad
  activo: boolean
}

export interface InventarioItemDTO {
  sedeId: string
  insumoId: string
  insumoNombre: string
  unidad: Unidad
  cantidad: number
  stockMinimo: number
  bajo: boolean
}

export interface MovimientoInventarioDTO {
  id: string
  sedeId: string
  insumoId: string
  insumoNombre: string
  unidad: Unidad
  tipo: TipoMovimiento
  cantidad: number
  saldoResultante: number
  pedidoNumero: number | null
  usuarioNombre: string | null
  nota: string | null
  creadoEn: string
}

export interface BuzonMensajeDTO {
  id: string
  tipo: TipoBuzon
  mensaje: string
  anonimo: boolean
  autorNombre: string | null
  sedeNombre: string | null
  estado: EstadoBuzon
  fecha: string
}

export interface ErrorApiDTO {
  error: {
    codigo: string
    mensaje: string
    campos?: Record<string, string[]>
  }
}

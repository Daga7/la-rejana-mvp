import type {
  EstadoBuzon,
  EstadoCuenta,
  EstadoMesa,
  FormaMesa,
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

/** Lo común a todo pedido: lo que ve la cocina y lo que suma en las ventas. */
interface PedidoBaseDTO {
  id: string
  numero: number
  sedeId: string
  sedeNombre: string
  estado: EstadoPedido
  notas: string | null
  subtotal: number
  costoEnvio: number
  total: number
  estadoPago: EstadoPago
  items: ItemPedidoDTO[]
  eventos: EventoPedidoDTO[]
  motivoCancelacion: string | null
  creadoEn: string
  actualizadoEn: string
  entregadoEn: string | null
  cerradoEn: string | null
}

/** Pedido a domicilio (lo hace el cliente o un invitado). */
export interface PedidoDomicilioDTO extends PedidoBaseDTO {
  canal: 'domicilio'
  contactoNombre: string
  contactoTelefono: string
  direccion: string
  direccionDetalle: string | null
  barrio: string | null
  lat: number
  lng: number
  metodoPago: MetodoPago
  pagaCon: number | null
  domiciliarioId: string | null
  domiciliarioNombre: string | null
  recorridoId: string | null
  esInvitado: boolean
  /** Minutos estimados de llegada (solo mientras va en camino). */
  etaMinutos: number | null
}

/** Ronda de una mesa: lo que el mesero envía de una vez a la cocina. Se cobra con la cuenta de la mesa. */
export interface PedidoMesaDTO extends PedidoBaseDTO {
  canal: 'mesa'
  mesa: {
    cuentaId: string
    mesaId: string
    numero: number
    zona: string | null
    ronda: number
    meseroNombre: string | null
  }
}

export type PedidoDTO = PedidoDomicilioDTO | PedidoMesaDTO

export interface PedidoCreadoDTO {
  pedido: PedidoDomicilioDTO
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

// --- Mesas ----------------------------------------------------------------------------

export interface MesaDTO {
  id: string
  sedeId: string
  numero: number
  zona: string | null
  puestos: number
  activa: boolean
  /** Posición y tamaño en el plano de su zona, en casillas. */
  x: number
  y: number
  ancho: number
  alto: number
  forma: FormaMesa
}

export interface PagoCuentaDTO {
  metodo: MetodoPago
  monto: number
  recibido: number | null
  cambio: number | null
  referencia: string | null
  creadoEn: string
}

/** Cuenta de una mesa con sus rondas. El total suma las rondas que no se cancelaron. */
export interface CuentaMesaDTO {
  id: string
  sedeId: string
  mesaId: string
  mesaNumero: number
  zona: string | null
  meseroId: string | null
  meseroNombre: string | null
  comensales: number
  estado: EstadoCuenta
  /** Cuándo la mesa pidió la cuenta (null si siguen pidiendo). */
  cuentaPedidaEn: string | null
  abiertaEn: string
  cerradaEn: string | null
  subtotal: number
  propina: number
  estadoPago: EstadoPago
  rondas: PedidoMesaDTO[]
  pagos: PagoCuentaDTO[]
}

/** Resumen de la cuenta abierta de una mesa, para el plano del salón. */
export interface ResumenCuentaDTO {
  id: string
  meseroId: string | null
  meseroNombre: string | null
  comensales: number
  subtotal: number
  abiertaEn: string
  cuentaPedidaEn: string | null
  /** Rondas en la cocina (en cola o en la parrilla). */
  enCocina: number
  /** Rondas listas para servir. */
  paraServir: number
  /** Rondas que no se cancelaron. */
  rondas: number
}

export interface MesaSalonDTO extends MesaDTO {
  estado: EstadoMesa
  cuenta: ResumenCuentaDTO | null
}

export interface SalonDTO {
  sede: { id: string; nombre: string }
  mesas: MesaSalonDTO[]
  /** Rondas listas en la cocina, de la más antigua a la más nueva. */
  paraServir: PedidoMesaDTO[]
}

// --- Turnos ------------------------------------------------------------------------------

export interface TurnoDTO {
  id: string
  usuarioId: string
  usuarioNombre: string
  rol: Rol
  sedeId: string
  sedeNombre: string
  entradaEn: string
  salidaEn: string | null
  /** Minutos trabajados (si sigue abierto, hasta ahora). */
  minutos: number
  abierto: boolean
  /** true si lo cerró el administrador porque el empleado olvidó marcar la salida. */
  cerradoPorAdmin: boolean
  nota: string | null
  /** Turno de más de 16 horas: probablemente olvidaron marcar la salida. */
  revisar: boolean
}

export interface ResumenTurnosDTO {
  usuarioId: string
  usuarioNombre: string
  rol: Rol
  sedeNombre: string
  turnos: number
  minutos: number
  abiertos: number
}

export interface ReporteTurnosDTO {
  etiqueta: string
  desde: string
  hasta: string
  turnos: TurnoDTO[]
  resumen: ResumenTurnosDTO[]
}


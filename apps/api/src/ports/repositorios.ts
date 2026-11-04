import type {
  CanalPedido,
  EstadoBuzon,
  EstadoCuenta,
  EstadoPago,
  EstadoPedido,
  MetodoPago,
  ProveedorOAuth,
  Rol,
  RolEmpleado,
  TipoBuzon,
  TipoMovimiento,
  Unidad,
} from '@rejana/shared'

// Puertos de persistencia. Las implementaciones viven en adapters/db (PostgreSQL + Drizzle).
// Los casos de uso solo conocen estas interfaces.

// ---------------------------------------------------------------------------
// Personas y acceso
// ---------------------------------------------------------------------------

export interface Usuario {
  id: string
  email: string
  nombre: string
  telefono: string | null
  passwordHash: string | null
  emailVerificadoEn: Date | null
  rol: Rol
  sedeId: string | null
  activo: boolean
  intentosFallidos: number
  bloqueadoHasta: Date | null
  aceptoPrivacidadEn: Date | null
  versionPrivacidad: string | null
  whatsappHabilitado: boolean
  ultimoIngresoEn: Date | null
  credencialesCambiadasEn: Date | null
  creadoEn: Date
}

export type NuevoUsuario = Pick<Usuario, 'email' | 'nombre' | 'rol'> &
  Partial<Pick<Usuario, 'telefono' | 'passwordHash' | 'emailVerificadoEn' | 'sedeId' | 'aceptoPrivacidadEn' | 'versionPrivacidad'>>

export type CambiosUsuario = Partial<
  Pick<
    Usuario,
    | 'nombre'
    | 'telefono'
    | 'passwordHash'
    | 'emailVerificadoEn'
    | 'rol'
    | 'sedeId'
    | 'activo'
    | 'intentosFallidos'
    | 'bloqueadoHasta'
    | 'aceptoPrivacidadEn'
    | 'versionPrivacidad'
    | 'whatsappHabilitado'
    | 'ultimoIngresoEn'
    | 'credencialesCambiadasEn'
  >
>

export interface RepoUsuarios {
  porId(id: string): Promise<Usuario | null>
  porEmail(email: string): Promise<Usuario | null>
  /** Admin activo con WhatsApp habilitado y ese teléfono (lista blanca del asistente). */
  adminWhatsapp(telefonoE164: string): Promise<Usuario | null>
  crear(datos: NuevoUsuario): Promise<Usuario>
  actualizar(id: string, cambios: CambiosUsuario): Promise<Usuario>
  /** Suma un intento fallido de forma atómica y devuelve el total. */
  sumarIntentoFallido(id: string): Promise<number>
  empleados(filtro: { sedeId?: string | null }): Promise<Usuario[]>
  domiciliarios(sedeId: string): Promise<Usuario[]>
  contarAdminsActivos(): Promise<number>
}

export interface IdentidadOAuth {
  id: string
  usuarioId: string
  proveedor: ProveedorOAuth
  sujeto: string
  email: string | null
}

export interface RepoIdentidades {
  buscar(proveedor: ProveedorOAuth, sujeto: string): Promise<IdentidadOAuth | null>
  crear(datos: Omit<IdentidadOAuth, 'id'>): Promise<IdentidadOAuth>
  deUsuario(usuarioId: string): Promise<IdentidadOAuth[]>
}

export interface Sesion {
  id: string
  usuarioId: string
  expiraEn: Date
  revocadaEn: Date | null
  ultimoUsoEn: Date
  creadoEn: Date
}

export interface TokenRefresco {
  id: string
  sesionId: string
  expiraEn: Date
  usadoEn: Date | null
}

export interface RepoSesiones {
  crear(datos: { usuarioId: string; ip: string | null; userAgent: string | null; expiraEn: Date }): Promise<Sesion>
  porId(id: string): Promise<Sesion | null>
  tocar(id: string, ahora: Date): Promise<void>
  revocar(id: string, motivo: string, ahora: Date): Promise<void>
  revocarTodas(usuarioId: string, motivo: string, ahora: Date, excepto?: string): Promise<number>
  guardarRefresco(datos: { sesionId: string; tokenHash: string; expiraEn: Date }): Promise<void>
  refrescoPorHash(tokenHash: string): Promise<TokenRefresco | null>
  /** Marca el token como usado solo si no lo estaba. false = ya se había usado (posible robo). */
  usarRefresco(id: string, ahora: Date): Promise<boolean>
}

export type PropositoCodigo = 'verificar_correo' | 'recuperar_clave'

export interface DatosRegistroPendiente {
  nombre: string
  passwordHash: string
  aceptoPrivacidadEn: string
}

export interface CodigoVerificacion {
  id: string
  email: string
  proposito: PropositoCodigo
  codigoHash: string
  datosPendientes: DatosRegistroPendiente | null
  vinculoHash: string | null
  intentos: number
  expiraEn: Date
  consumidoEn: Date | null
  creadoEn: Date
}

export interface RepoCodigos {
  vigente(email: string, proposito: PropositoCodigo, ahora: Date): Promise<CodigoVerificacion | null>
  ultimo(email: string, proposito: PropositoCodigo): Promise<CodigoVerificacion | null>
  contarDesde(email: string, proposito: PropositoCodigo, desde: Date): Promise<number>
  crear(datos: {
    email: string
    proposito: PropositoCodigo
    codigoHash: string
    /** Lo fija el caso de uso con su reloj (las reglas de espera y conteo dependen de él). */
    creadoEn: Date
    expiraEn: Date
    datosPendientes?: DatosRegistroPendiente | null
    vinculoHash?: string | null
  }): Promise<CodigoVerificacion>
  invalidar(email: string, proposito: PropositoCodigo, ahora: Date): Promise<void>
  sumarIntento(id: string): Promise<number>
  consumir(id: string, ahora: Date): Promise<boolean>
}

export interface Invitacion {
  id: string
  email: string
  rol: RolEmpleado
  sedeId: string | null
  invitadoPor: string | null
  expiraEn: Date
  aceptadaEn: Date | null
  revocadaEn: Date | null
  creadoEn: Date
}

export interface RepoInvitaciones {
  crear(datos: { email: string; rol: RolEmpleado; sedeId: string | null; tokenHash: string; invitadoPor: string | null; expiraEn: Date }): Promise<Invitacion>
  porTokenHash(tokenHash: string): Promise<Invitacion | null>
  porId(id: string): Promise<Invitacion | null>
  /** Marca aceptada solo si sigue pendiente (uso único). */
  aceptar(id: string, usuarioId: string, ahora: Date): Promise<boolean>
  revocar(id: string, ahora: Date): Promise<void>
  revocarPendientesDe(email: string, ahora: Date): Promise<void>
  pendientes(ahora: Date): Promise<Invitacion[]>
}

export interface DireccionCliente {
  id: string
  usuarioId: string
  etiqueta: string
  direccion: string
  detalle: string | null
  barrio: string | null
  lat: number
  lng: number
}

export interface RepoDirecciones {
  deUsuario(usuarioId: string): Promise<DireccionCliente[]>
  crear(datos: Omit<DireccionCliente, 'id'>): Promise<DireccionCliente>
  eliminar(id: string, usuarioId: string): Promise<boolean>
  contar(usuarioId: string): Promise<number>
}

// ---------------------------------------------------------------------------
// Sedes, menú e inventario
// ---------------------------------------------------------------------------

export interface Sede {
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
  tarifaDomicilio: number
  limiteMinutosEntrega: number
  minutosPreparacion: number
  radioEntregaKm: number
  qrPagoUrl: string | null
  qrPagoInstrucciones: string | null
  activa: boolean
}

export type DatosSede = Omit<Sede, 'id' | 'slug'>

export interface RepoSedes {
  todas(soloActivas: boolean): Promise<Sede[]>
  porId(id: string): Promise<Sede | null>
  crear(datos: DatosSede & { slug: string }): Promise<Sede>
  actualizar(id: string, datos: Partial<DatosSede>): Promise<Sede>
  slugExiste(slug: string): Promise<boolean>
}

export interface Categoria {
  id: string
  nombre: string
  slug: string
  orden: number
  activa: boolean
}

export interface Producto {
  id: string
  categoriaId: string
  nombre: string
  slug: string
  descripcion: string
  imagenUrl: string | null
  activo: boolean
}

export interface LineaRecetaDetalle {
  insumoId: string
  insumoNombre: string
  unidad: Unidad
  cantidad: number
}

export interface EntradaMenu {
  sedeId: string
  productoId: string
  precio: number
  disponible: boolean
  orden: number
}

export interface RepoCatalogo {
  categorias(soloActivas: boolean): Promise<Categoria[]>
  categoriaPorId(id: string): Promise<Categoria | null>
  crearCategoria(datos: Omit<Categoria, 'id'>): Promise<Categoria>
  actualizarCategoria(id: string, datos: Partial<Omit<Categoria, 'id'>>): Promise<Categoria>
  productos(): Promise<Producto[]>
  productoPorId(id: string): Promise<Producto | null>
  crearProducto(datos: Omit<Producto, 'id'>): Promise<Producto>
  actualizarProducto(id: string, datos: Partial<Omit<Producto, 'id'>>): Promise<Producto>
  slugProductoExiste(slug: string, exceptoId?: string): Promise<boolean>
  /** Recetas de varios productos (productoId → líneas). */
  recetas(productoIds: string[]): Promise<Map<string, LineaRecetaDetalle[]>>
  reemplazarReceta(productoId: string, items: { insumoId: string; cantidad: number }[]): Promise<void>
  menuDeSede(sedeId: string): Promise<EntradaMenu[]>
  entradasMenu(productoId: string): Promise<EntradaMenu[]>
  guardarEntradaMenu(entrada: EntradaMenu): Promise<void>
  quitarDeMenu(sedeId: string, productoId: string): Promise<void>
}

export interface Insumo {
  id: string
  nombre: string
  unidad: Unidad
  activo: boolean
}

export interface ItemInventario {
  sedeId: string
  insumoId: string
  insumoNombre: string
  unidad: Unidad
  cantidad: number
  stockMinimo: number
}

export interface Movimiento {
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
  creadoEn: Date
}

export interface RepoInventario {
  insumos(soloActivos: boolean): Promise<Insumo[]>
  insumoPorId(id: string): Promise<Insumo | null>
  crearInsumo(datos: Omit<Insumo, 'id'>): Promise<Insumo>
  actualizarInsumo(id: string, datos: Partial<Omit<Insumo, 'id'>>): Promise<Insumo>
  nombreInsumoExiste(nombre: string, exceptoId?: string): Promise<boolean>
  deSede(sedeId: string): Promise<ItemInventario[]>
  /** Stock (insumoId → cantidad) de una sede, opcionalmente filtrado. */
  stock(sedeId: string, insumoIds?: string[]): Promise<Map<string, number>>
  /**
   * Bloquea las filas de inventario (SELECT … FOR UPDATE, en orden) dentro de una transacción
   * para que dos pedidos simultáneos no vendan el mismo insumo.
   */
  bloquear(sedeId: string, insumoIds: string[]): Promise<Map<string, number>>
  /** Suma (o resta) una cantidad y deja el movimiento registrado. Devuelve el saldo resultante. */
  mover(datos: {
    sedeId: string
    insumoId: string
    delta: number
    tipo: TipoMovimiento
    pedidoId?: string | null
    usuarioId?: string | null
    nota?: string | null
  }): Promise<number>
  fijarMinimo(sedeId: string, insumoId: string, minimo: number): Promise<void>
  asegurarFila(sedeId: string, insumoId: string): Promise<void>
  movimientos(filtro: { sedeId: string; insumoId?: string; limite: number }): Promise<Movimiento[]>
  movimientosDePedido(pedidoId: string): Promise<{ insumoId: string; cantidad: number; tipo: TipoMovimiento }[]>
}

// ---------------------------------------------------------------------------
// Pedidos y domicilios
// ---------------------------------------------------------------------------

interface PedidoRegistroBase {
  id: string
  numero: number
  sedeId: string
  sedeNombre: string
  clienteId: string | null
  estado: EstadoPedido
  notas: string | null
  pagaCon: number | null
  subtotal: number
  costoEnvio: number
  total: number
  estadoPago: EstadoPago
  domiciliarioId: string | null
  domiciliarioNombre: string | null
  recorridoId: string | null
  tokenSeguimientoHash: string | null
  motivoCancelacion: string | null
  creadoEn: Date
  actualizadoEn: Date
  enCaminoEn: Date | null
  entregadoEn: Date | null
  canceladoEn: Date | null
  cerradoEn: Date | null
}

export interface PedidoDomicilioRegistro extends PedidoRegistroBase {
  canal: 'domicilio'
  contactoNombre: string
  contactoTelefono: string
  direccion: string
  direccionDetalle: string | null
  barrio: string | null
  lat: number
  lng: number
  metodoPago: MetodoPago
}

/** Ronda de una cuenta de mesa. */
export interface PedidoMesaRegistro extends PedidoRegistroBase {
  canal: 'mesa'
  cuentaId: string
  ronda: number
  mesaId: string
  mesaNumero: number
  zona: string | null
  /** Mesero que atiende la cuenta. */
  meseroNombre: string | null
}

export type PedidoRegistro = PedidoDomicilioRegistro | PedidoMesaRegistro

export interface ItemPedidoRegistro {
  id: string
  productoId: string
  nombre: string
  precioUnitario: number
  cantidad: number
  notas: string | null
  subtotal: number
}

export interface EventoPedido {
  estado: EstadoPedido
  actorRol: string | null
  nota: string | null
  creadoEn: Date
}

export interface PagoRegistro {
  id: string
  metodo: MetodoPago
  monto: number
  recibido: number | null
  cambio: number | null
  referencia: string | null
  creadoEn: Date
}

interface NuevoPedidoBase {
  sedeId: string
  notas: string | null
  subtotal: number
  costoEnvio: number
  total: number
  claveIdempotencia: string | null
}

export interface NuevoPedidoDomicilio extends NuevoPedidoBase {
  canal?: 'domicilio'
  clienteId: string | null
  contactoNombre: string
  contactoTelefono: string
  direccion: string
  direccionDetalle: string | null
  barrio: string | null
  lat: number
  lng: number
  metodoPago: MetodoPago
  pagaCon: number | null
  tokenSeguimientoHash: string | null
}

export interface NuevoPedidoMesa extends NuevoPedidoBase {
  canal: 'mesa'
  cuentaId: string
  ronda: number
}

export type NuevoPedido = NuevoPedidoDomicilio | NuevoPedidoMesa

export interface FiltroPedidos {
  sedeId?: string
  canal?: CanalPedido
  cuentaIds?: string[]
  estados?: EstadoPedido[]
  clienteId?: string
  domiciliarioId?: string
  recorridoId?: string
  desde?: Date
  sinCerrar?: boolean
  limite?: number
}

export interface RepoPedidos {
  /** `actor`: quién lo crea, para el primer evento (por defecto, el cliente o el invitado). */
  crear(datos: NuevoPedido, items: Omit<ItemPedidoRegistro, 'id'>[], actor?: { id: string; rol: string }): Promise<PedidoRegistro>
  porId(id: string, opciones?: { bloquear?: boolean }): Promise<PedidoRegistro | null>
  porIdempotencia(clave: string): Promise<PedidoRegistro | null>
  listar(filtro: FiltroPedidos): Promise<PedidoRegistro[]>
  items(pedidoIds: string[]): Promise<Map<string, ItemPedidoRegistro[]>>
  eventos(pedidoId: string): Promise<EventoPedido[]>
  pagos(pedidoId: string): Promise<PagoRegistro[]>
  actualizar(
    id: string,
    cambios: Partial<
      Pick<
        PedidoRegistro,
        | 'estado'
        | 'estadoPago'
        | 'domiciliarioId'
        | 'recorridoId'
        | 'motivoCancelacion'
        | 'enCaminoEn'
        | 'entregadoEn'
        | 'canceladoEn'
        | 'cerradoEn'
      > & { cerradoPor: string | null }
    >,
  ): Promise<void>
  registrarEvento(datos: { pedidoId: string; estado: EstadoPedido; actorId: string | null; actorRol: string | null; nota?: string | null }): Promise<void>
  registrarPago(datos: Omit<PagoRegistro, 'id' | 'creadoEn'> & { pedidoId: string; registradoPor: string }): Promise<void>
  rotarTokenSeguimiento(id: string, tokenHash: string): Promise<void>
}

// --- Mesas -----------------------------------------------------------------------------

export interface MesaRegistro {
  id: string
  sedeId: string
  numero: number
  zona: string | null
  puestos: number
  activa: boolean
}

export interface CuentaRegistro {
  id: string
  sedeId: string
  mesaId: string
  mesaNumero: number
  zona: string | null
  meseroId: string | null
  meseroNombre: string | null
  comensales: number
  estado: EstadoCuenta
  cuentaPedidaEn: Date | null
  propina: number
  estadoPago: EstadoPago
  abiertaEn: Date
  actualizadoEn: Date
  cerradaEn: Date | null
}

export interface RepoMesas {
  mesas(sedeId: string, opciones?: { incluirInactivas?: boolean }): Promise<MesaRegistro[]>
  mesa(id: string): Promise<MesaRegistro | null>
  crearMesa(datos: Omit<MesaRegistro, 'id'>): Promise<MesaRegistro>
  actualizarMesa(id: string, cambios: Partial<Omit<MesaRegistro, 'id' | 'sedeId'>>): Promise<void>
  cuentasAbiertas(sedeId: string): Promise<CuentaRegistro[]>
  /** `bloquear`: bloquea la fila hasta el fin de la transacción (rondas y cobros concurrentes). */
  cuenta(id: string, opciones?: { bloquear?: boolean }): Promise<CuentaRegistro | null>
  cuentaAbiertaDeMesa(mesaId: string): Promise<CuentaRegistro | null>
  /** Falla con violación de unicidad (23505) si la mesa ya tiene una cuenta abierta. */
  abrirCuenta(datos: { sedeId: string; mesaId: string; meseroId: string | null; comensales: number }): Promise<CuentaRegistro>
  actualizarCuenta(
    id: string,
    cambios: Partial<Pick<CuentaRegistro, 'comensales' | 'cuentaPedidaEn' | 'estado' | 'propina' | 'estadoPago' | 'cerradaEn'> & { cerradaPor: string | null }>,
  ): Promise<void>
  /** Número de la próxima ronda (llamar con la cuenta bloqueada). */
  siguienteRonda(cuentaId: string): Promise<number>
  pagos(cuentaId: string): Promise<PagoRegistro[]>
  registrarPago(datos: Omit<PagoRegistro, 'id' | 'creadoEn'> & { cuentaId: string; registradoPor: string }): Promise<void>
}

// --- Turnos -----------------------------------------------------------------------------

export interface TurnoRegistro {
  id: string
  usuarioId: string
  usuarioNombre: string
  rol: Rol
  sedeId: string
  sedeNombre: string
  entradaEn: Date
  salidaEn: Date | null
  cerradoPor: string | null
  nota: string | null
}

export interface RepoTurnos {
  abiertoDe(usuarioId: string): Promise<TurnoRegistro | null>
  porId(id: string, opciones?: { bloquear?: boolean }): Promise<TurnoRegistro | null>
  /** Falla con violación de unicidad (23505) si la persona ya tiene un turno abierto. */
  abrir(datos: { usuarioId: string; sedeId: string; entradaEn: Date }): Promise<TurnoRegistro>
  cerrar(id: string, datos: { salidaEn: Date; cerradoPor: string | null; nota: string | null }): Promise<void>
  /** Turnos cuya entrada cae en el rango [desde, hasta). */
  listar(filtro: { desde: Date; hasta: Date; sedeId?: string; usuarioId?: string }): Promise<TurnoRegistro[]>
}

export interface Recorrido {
  id: string
  sedeId: string
  domiciliarioId: string
  estado: 'activo' | 'finalizado'
  ordenParadas: string[]
  ultimaLat: number | null
  ultimaLng: number | null
  ultimaUbicacionEn: Date | null
  iniciadoEn: Date
  finalizadoEn: Date | null
}

export interface RepoRecorridos {
  crear(datos: { sedeId: string; domiciliarioId: string; ordenParadas: string[] }): Promise<Recorrido>
  activoDe(domiciliarioId: string): Promise<Recorrido | null>
  porId(id: string): Promise<Recorrido | null>
  guardarUbicacion(id: string, lat: number, lng: number, fecha: Date): Promise<void>
  /** Finaliza y borra la última ubicación (minimización de datos). */
  finalizar(id: string, fecha: Date): Promise<void>
}

export interface SuscripcionPush {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  usuarioId: string | null
}

export interface RepoSuscripciones {
  guardar(datos: Omit<SuscripcionPush, 'id'>): Promise<SuscripcionPush>
  vincularPedido(pedidoId: string, suscripcionId: string): Promise<void>
  dePedido(pedidoId: string, clienteId: string | null): Promise<SuscripcionPush[]>
  eliminarPorEndpoint(endpoint: string): Promise<void>
  eliminar(id: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Gobierno
// ---------------------------------------------------------------------------

export interface MensajeBuzon {
  id: string
  tipo: TipoBuzon
  mensaje: string
  anonimo: boolean
  autorNombre: string | null
  sedeNombre: string | null
  estado: EstadoBuzon
  fecha: string
}

export interface RepoBuzon {
  crear(datos: { tipo: TipoBuzon; mensaje: string; anonimo: boolean; autorId: string | null; sedeId: string | null; fecha: string }): Promise<{ id: string }>
  listar(filtro: { estado?: EstadoBuzon }): Promise<MensajeBuzon[]>
  cambiarEstado(id: string, estado: EstadoBuzon, ahora: Date): Promise<boolean>
}

export interface EntradaAuditoria {
  actorId: string | null
  actorRol: string | null
  accion: string
  entidad: string
  entidadId: string | null
  datos?: Record<string, unknown> | null
  ip?: string | null
}

export interface RegistroAuditoria extends EntradaAuditoria {
  id: string
  actorNombre: string | null
  creadoEn: Date
}

export interface RepoAuditoria {
  registrar(entrada: EntradaAuditoria): Promise<void>
  listar(filtro: { entidad?: string; limite: number; antesDe?: Date }): Promise<RegistroAuditoria[]>
}

export interface RepoWhatsapp {
  /** Registra el mensaje entrante; false si ya se había procesado (reintento de Meta). */
  registrarEntrante(wamid: string, telefono: string, tipo: string): Promise<boolean>
  marcar(wamid: string, estado: 'procesado' | 'ignorado' | 'error', ahora: Date): Promise<void>
}

// ---------------------------------------------------------------------------
// Reportes (consultas de lectura del catálogo cerrado)
// ---------------------------------------------------------------------------

export interface VentasPorDia {
  dia: string
  sedeId: string
  pedidos: number
  ventas: number
}

export interface ProductoVendido {
  productoId: string
  nombre: string
  unidades: number
  ventas: number
}

export interface RepoReportes {
  ventasPorDia(filtro: { sedeId: string | null; desde: Date; hasta: Date }): Promise<VentasPorDia[]>
  productosMasVendidos(filtro: { sedeId: string | null; desde: Date; hasta: Date; limite: number }): Promise<ProductoVendido[]>
  pedidosPorEstado(filtro: { sedeId: string | null; desde: Date; hasta: Date }): Promise<{ estado: EstadoPedido; cantidad: number }[]>
}

// ---------------------------------------------------------------------------
// Unidad de trabajo
// ---------------------------------------------------------------------------

export interface Repositorios {
  usuarios: RepoUsuarios
  identidades: RepoIdentidades
  sesiones: RepoSesiones
  codigos: RepoCodigos
  invitaciones: RepoInvitaciones
  direcciones: RepoDirecciones
  sedes: RepoSedes
  catalogo: RepoCatalogo
  inventario: RepoInventario
  pedidos: RepoPedidos
  mesas: RepoMesas
  turnos: RepoTurnos
  recorridos: RepoRecorridos
  suscripciones: RepoSuscripciones
  buzon: RepoBuzon
  auditoria: RepoAuditoria
  whatsapp: RepoWhatsapp
  reportes: RepoReportes
}

export interface UnidadDeTrabajo {
  /** Repositorios fuera de transacción. */
  repos: Repositorios
  /** Ejecuta `fn` en una transacción; si lanza, se revierte todo. */
  transaccion<T>(fn: (repos: Repositorios) => Promise<T>): Promise<T>
}

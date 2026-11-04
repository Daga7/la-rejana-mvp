import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Esquema de PostgreSQL. Las migraciones se generan con `pnpm db:generate` (drizzle-kit)
// y quedan versionadas en apps/api/drizzle/.

const creadoEn = () => timestamp('creado_en', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
const actualizadoEn = () => timestamp('actualizado_en', { withTimezone: true, mode: 'date' }).defaultNow().notNull()
const ts = (nombre: string) => timestamp(nombre, { withTimezone: true, mode: 'date' })
const cantidad = (nombre: string) => numeric(nombre, { precision: 14, scale: 3, mode: 'number' })

// ---------------------------------------------------------------------------
// Sedes y personas
// ---------------------------------------------------------------------------

export const sedes = pgTable(
  'sedes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    nombre: text('nombre').notNull(),
    direccion: text('direccion').notNull(),
    barrio: text('barrio').notNull().default(''),
    telefono: text('telefono').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    horaApertura: time('hora_apertura').notNull(),
    horaCierre: time('hora_cierre').notNull(),
    tarifaDomicilio: integer('tarifa_domicilio').notNull().default(0),
    limiteMinutosEntrega: integer('limite_minutos_entrega').notNull().default(25),
    minutosPreparacion: integer('minutos_preparacion').notNull().default(20),
    radioEntregaKm: doublePrecision('radio_entrega_km').notNull().default(5),
    qrPagoUrl: text('qr_pago_url'),
    qrPagoInstrucciones: text('qr_pago_instrucciones'),
    activa: boolean('activa').notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [uniqueIndex('sedes_slug_uq').on(t.slug), check('sedes_tarifa_ck', sql`${t.tarifaDomicilio} >= 0`)],
)

export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    nombre: text('nombre').notNull(),
    telefono: text('telefono'),
    passwordHash: text('password_hash'),
    emailVerificadoEn: ts('email_verificado_en'),
    rol: text('rol', { enum: ['cliente', 'mesero', 'cocina', 'caja', 'domiciliario', 'admin'] }).notNull().default('cliente'),
    sedeId: uuid('sede_id').references(() => sedes.id, { onDelete: 'restrict' }),
    activo: boolean('activo').notNull().default(true),
    intentosFallidos: integer('intentos_fallidos').notNull().default(0),
    bloqueadoHasta: ts('bloqueado_hasta'),
    aceptoPrivacidadEn: ts('acepto_privacidad_en'),
    versionPrivacidad: text('version_privacidad'),
    whatsappHabilitado: boolean('whatsapp_habilitado').notNull().default(false),
    ultimoIngresoEn: ts('ultimo_ingreso_en'),
    credencialesCambiadasEn: ts('credenciales_cambiadas_en'),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('usuarios_email_uq').on(t.email),
    index('usuarios_telefono_idx').on(t.telefono),
    index('usuarios_rol_sede_idx').on(t.rol, t.sedeId),
    check('usuarios_email_minusculas_ck', sql`${t.email} = lower(${t.email})`),
    check(
      'usuarios_rol_ck',
      sql`${t.rol} in ('cliente','mesero','cocina','caja','domiciliario','admin')`,
    ),
    // Los empleados operativos siempre pertenecen a una sede.
    check('usuarios_sede_empleado_ck', sql`${t.rol} in ('cliente','admin') or ${t.sedeId} is not null`),
  ],
)

export const identidadesOAuth = pgTable(
  'identidades_oauth',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    proveedor: text('proveedor', { enum: ['google', 'apple'] }).notNull(),
    sujeto: text('sujeto').notNull(),
    email: text('email'),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('identidades_proveedor_sujeto_uq').on(t.proveedor, t.sujeto), index('identidades_usuario_idx').on(t.usuarioId)],
)

export const sesiones = pgTable(
  'sesiones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiraEn: ts('expira_en').notNull(),
    revocadaEn: ts('revocada_en'),
    motivoRevocacion: text('motivo_revocacion'),
    ultimoUsoEn: ts('ultimo_uso_en').defaultNow().notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [index('sesiones_usuario_idx').on(t.usuarioId)],
)

export const tokensRefresco = pgTable(
  'tokens_refresco',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sesionId: uuid('sesion_id')
      .notNull()
      .references(() => sesiones.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiraEn: ts('expira_en').notNull(),
    usadoEn: ts('usado_en'),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('tokens_refresco_hash_uq').on(t.tokenHash), index('tokens_refresco_sesion_idx').on(t.sesionId)],
)

export const codigosVerificacion = pgTable(
  'codigos_verificacion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    proposito: text('proposito', { enum: ['verificar_correo', 'recuperar_clave'] }).notNull(),
    codigoHash: text('codigo_hash').notNull(),
    /** Registro pendiente (nombre, hash de clave): la cuenta solo se crea al verificar el código. */
    datosPendientes: jsonb('datos_pendientes').$type<{ nombre: string; passwordHash: string; aceptoPrivacidadEn: string }>(),
    /** Huella del navegador que pidió el código: el código solo sirve en ese navegador. */
    vinculoHash: text('vinculo_hash'),
    intentos: integer('intentos').notNull().default(0),
    expiraEn: ts('expira_en').notNull(),
    consumidoEn: ts('consumido_en'),
    creadoEn: creadoEn(),
  },
  (t) => [index('codigos_email_proposito_idx').on(t.email, t.proposito, t.creadoEn)],
)

export const invitaciones = pgTable(
  'invitaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    rol: text('rol', { enum: ['mesero', 'cocina', 'caja', 'domiciliario', 'admin'] }).notNull(),
    sedeId: uuid('sede_id').references(() => sedes.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    invitadoPor: uuid('invitado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    expiraEn: ts('expira_en').notNull(),
    aceptadaEn: ts('aceptada_en'),
    revocadaEn: ts('revocada_en'),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('invitaciones_token_uq').on(t.tokenHash), index('invitaciones_email_idx').on(t.email)],
)

export const direccionesCliente = pgTable(
  'direcciones_cliente',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    etiqueta: text('etiqueta').notNull().default('Casa'),
    direccion: text('direccion').notNull(),
    detalle: text('detalle'),
    barrio: text('barrio'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [index('direcciones_usuario_idx').on(t.usuarioId)],
)

// ---------------------------------------------------------------------------
// Menú, recetas e inventario
// ---------------------------------------------------------------------------

export const categorias = pgTable(
  'categorias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    slug: text('slug').notNull(),
    orden: integer('orden').notNull().default(0),
    activa: boolean('activa').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('categorias_slug_uq').on(t.slug)],
)

export const productos = pgTable(
  'productos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    nombre: text('nombre').notNull(),
    slug: text('slug').notNull(),
    descripcion: text('descripcion').notNull().default(''),
    imagenUrl: text('imagen_url'),
    activo: boolean('activo').notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [uniqueIndex('productos_slug_uq').on(t.slug), index('productos_categoria_idx').on(t.categoriaId)],
)

/** Qué productos ofrece cada sede y a qué precio (menú por sede). */
export const menuSede = pgTable(
  'menu_sede',
  {
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'cascade' }),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id, { onDelete: 'cascade' }),
    precio: integer('precio').notNull(),
    disponible: boolean('disponible').notNull().default(true),
    orden: integer('orden').notNull().default(0),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [primaryKey({ columns: [t.sedeId, t.productoId] }), check('menu_precio_ck', sql`${t.precio} >= 0`)],
)

export const insumos = pgTable(
  'insumos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: text('nombre').notNull(),
    unidad: text('unidad', { enum: ['g', 'ml', 'und'] }).notNull(),
    activo: boolean('activo').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('insumos_nombre_uq').on(t.nombre), check('insumos_unidad_ck', sql`${t.unidad} in ('g','ml','und')`)],
)

export const recetaItems = pgTable(
  'receta_items',
  {
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id, { onDelete: 'cascade' }),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumos.id, { onDelete: 'restrict' }),
    cantidad: cantidad('cantidad').notNull(),
  },
  (t) => [primaryKey({ columns: [t.productoId, t.insumoId] }), check('receta_cantidad_ck', sql`${t.cantidad} > 0`)],
)

export const inventario = pgTable(
  'inventario',
  {
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'cascade' }),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumos.id, { onDelete: 'cascade' }),
    cantidad: cantidad('cantidad').notNull().default(0),
    stockMinimo: cantidad('stock_minimo').notNull().default(0),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    primaryKey({ columns: [t.sedeId, t.insumoId] }),
    // Garantía final contra sobreventa: el saldo nunca puede quedar negativo.
    check('inventario_no_negativo_ck', sql`${t.cantidad} >= 0`),
    check('inventario_minimo_ck', sql`${t.stockMinimo} >= 0`),
  ],
)

export const movimientosInventario = pgTable(
  'movimientos_inventario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'cascade' }),
    insumoId: uuid('insumo_id')
      .notNull()
      .references(() => insumos.id, { onDelete: 'cascade' }),
    tipo: text('tipo', { enum: ['consumo_pedido', 'reposicion_cancelacion', 'ajuste_manual', 'entrada'] }).notNull(),
    cantidad: cantidad('cantidad').notNull(),
    saldoResultante: cantidad('saldo_resultante').notNull(),
    pedidoId: uuid('pedido_id').references((): AnyPgColumn => pedidos.id, { onDelete: 'set null' }),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    nota: text('nota'),
    creadoEn: creadoEn(),
  },
  (t) => [index('movimientos_sede_fecha_idx').on(t.sedeId, t.creadoEn), index('movimientos_pedido_idx').on(t.pedidoId)],
)

// ---------------------------------------------------------------------------
// Pedidos, pagos y domicilios
// ---------------------------------------------------------------------------

export const ESTADOS_PEDIDO_DB = ['recibido', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado'] as const

export const recorridos = pgTable(
  'recorridos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'restrict' }),
    domiciliarioId: uuid('domiciliario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    estado: text('estado', { enum: ['activo', 'finalizado'] }).notNull().default('activo'),
    ordenParadas: jsonb('orden_paradas').$type<string[]>().notNull().default([]),
    ultimaLat: doublePrecision('ultima_lat'),
    ultimaLng: doublePrecision('ultima_lng'),
    ultimaUbicacionEn: ts('ultima_ubicacion_en'),
    iniciadoEn: creadoEn(),
    finalizadoEn: ts('finalizado_en'),
  },
  (t) => [
    index('recorridos_domiciliario_idx').on(t.domiciliarioId, t.estado),
    // Un domiciliario tiene como máximo un recorrido activo.
    uniqueIndex('recorridos_un_activo_uq').on(t.domiciliarioId).where(sql`${t.estado} = 'activo'`),
  ],
)

// ---------------------------------------------------------------------------
// Mesas (servicio en el restaurante)
// ---------------------------------------------------------------------------

export const mesas = pgTable(
  'mesas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'restrict' }),
    numero: integer('numero').notNull(),
    zona: text('zona'),
    puestos: integer('puestos').notNull().default(4),
    activa: boolean('activa').notNull().default(true),
    // Plano de la zona: posición y tamaño en casillas de una cuadrícula de 24 × 24.
    posX: integer('pos_x').notNull().default(0),
    posY: integer('pos_y').notNull().default(0),
    ancho: integer('ancho').notNull().default(2),
    alto: integer('alto').notNull().default(2),
    forma: text('forma', { enum: ['cuadrada', 'redonda', 'rectangular'] }).notNull().default('cuadrada'),
    // Mesa juntada a la cuenta abierta de otra mesa (un grupo que ocupa varias mesas). Se limpia al cerrar la cuenta.
    cuentaUnidaId: uuid('cuenta_unida_id').references((): AnyPgColumn => cuentasMesa.id, { onDelete: 'set null' }),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('mesas_sede_numero_uq').on(t.sedeId, t.numero),
    check('mesas_numero_ck', sql`${t.numero} between 1 and 999`),
    check('mesas_puestos_ck', sql`${t.puestos} between 1 and 20`),
    check('mesas_forma_ck', sql`${t.forma} in ('cuadrada','redonda','rectangular')`),
    check('mesas_plano_ck', sql`${t.ancho} between 1 and 4 and ${t.alto} between 1 and 4 and ${t.posX} >= 0 and ${t.posY} >= 0 and ${t.posX} + ${t.ancho} <= 24 and ${t.posY} + ${t.alto} <= 24`),
  ],
)

/** Cuenta de una mesa: se abre al sentar a los clientes y se cierra al cobrar. Sus rondas son pedidos de canal "mesa". */
export const cuentasMesa = pgTable(
  'cuentas_mesa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'restrict' }),
    mesaId: uuid('mesa_id')
      .notNull()
      .references(() => mesas.id, { onDelete: 'restrict' }),
    meseroId: uuid('mesero_id').references(() => usuarios.id, { onDelete: 'set null' }),
    comensales: integer('comensales').notNull(),
    estado: text('estado', { enum: ['abierta', 'cerrada', 'cancelada', 'unida'] }).notNull().default('abierta'),
    // Cuenta en la que se fundió esta (estado «unida»): sus rondas y pagos pasaron allá.
    unidaA: uuid('unida_a').references((): AnyPgColumn => cuentasMesa.id, { onDelete: 'restrict' }),
    cuentaPedidaEn: ts('cuenta_pedida_en'),
    propina: integer('propina').notNull().default(0),
    estadoPago: text('estado_pago', { enum: ['pendiente', 'pagado'] }).notNull().default('pendiente'),
    abiertaEn: timestamp('abierta_en', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    actualizadoEn: actualizadoEn(),
    cerradaEn: ts('cerrada_en'),
    cerradaPor: uuid('cerrada_por').references(() => usuarios.id, { onDelete: 'set null' }),
  },
  (t) => [
    // Una mesa tiene a lo sumo una cuenta abierta.
    uniqueIndex('cuentas_mesa_abierta_uq').on(t.mesaId).where(sql`${t.estado} = 'abierta'`),
    index('cuentas_mesa_sede_estado_idx').on(t.sedeId, t.estado),
    check('cuentas_mesa_estado_ck', sql`${t.estado} in ('abierta','cerrada','cancelada','unida')`),
    check('cuentas_mesa_unida_ck', sql`(${t.estado} = 'unida') = (${t.unidaA} is not null)`),
    check('cuentas_mesa_comensales_ck', sql`${t.comensales} between 1 and 30`),
    check('cuentas_mesa_propina_ck', sql`${t.propina} >= 0`),
    check('cuentas_mesa_cierre_ck', sql`(${t.estado} = 'abierta') = (${t.cerradaEn} is null)`),
  ],
)

export const pedidos = pgTable(
  'pedidos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    numero: integer('numero').generatedAlwaysAsIdentity({ startWith: 1001 }).notNull(),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'restrict' }),
    canal: text('canal', { enum: ['domicilio', 'mesa'] }).notNull().default('domicilio'),
    clienteId: uuid('cliente_id').references(() => usuarios.id, { onDelete: 'set null' }),
    estado: text('estado', { enum: ESTADOS_PEDIDO_DB }).notNull().default('recibido'),
    // Solo domicilio (la restricción pedidos_canal_ck lo exige según el canal).
    contactoNombre: text('contacto_nombre'),
    contactoTelefono: text('contacto_telefono'),
    direccion: text('direccion'),
    direccionDetalle: text('direccion_detalle'),
    barrio: text('barrio'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    notas: text('notas'),
    metodoPago: text('metodo_pago', { enum: ['efectivo', 'qr'] }),
    // Solo mesa: la cuenta a la que pertenece la ronda y su número dentro de la cuenta.
    cuentaId: uuid('cuenta_id').references(() => cuentasMesa.id, { onDelete: 'restrict' }),
    ronda: integer('ronda'),
    pagaCon: integer('paga_con'),
    subtotal: integer('subtotal').notNull(),
    costoEnvio: integer('costo_envio').notNull(),
    total: integer('total').notNull(),
    estadoPago: text('estado_pago', { enum: ['pendiente', 'pagado'] }).notNull().default('pendiente'),
    domiciliarioId: uuid('domiciliario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    recorridoId: uuid('recorrido_id').references(() => recorridos.id, { onDelete: 'set null' }),
    tokenSeguimientoHash: text('token_seguimiento_hash'),
    claveIdempotencia: text('clave_idempotencia'),
    motivoCancelacion: text('motivo_cancelacion'),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
    enCaminoEn: ts('en_camino_en'),
    entregadoEn: ts('entregado_en'),
    canceladoEn: ts('cancelado_en'),
    cerradoEn: ts('cerrado_en'),
    cerradoPor: uuid('cerrado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('pedidos_numero_uq').on(t.numero),
    uniqueIndex('pedidos_idempotencia_uq').on(t.claveIdempotencia),
    index('pedidos_sede_estado_idx').on(t.sedeId, t.estado),
    index('pedidos_sede_fecha_idx').on(t.sedeId, t.creadoEn),
    index('pedidos_cliente_idx').on(t.clienteId, t.creadoEn),
    index('pedidos_domiciliario_idx').on(t.domiciliarioId, t.estado),
    check('pedidos_estado_ck', sql`${t.estado} in ('recibido','en_preparacion','listo','en_camino','entregado','cancelado')`),
    check('pedidos_totales_ck', sql`${t.subtotal} >= 0 and ${t.costoEnvio} >= 0 and ${t.total} = ${t.subtotal} + ${t.costoEnvio}`),
    check(
      'pedidos_canal_ck',
      sql`(${t.canal} = 'domicilio' and ${t.cuentaId} is null and ${t.ronda} is null and ${t.contactoNombre} is not null and ${t.contactoTelefono} is not null and ${t.direccion} is not null and ${t.lat} is not null and ${t.lng} is not null and ${t.metodoPago} is not null)
        or (${t.canal} = 'mesa' and ${t.cuentaId} is not null and ${t.ronda} >= 1 and ${t.costoEnvio} = 0 and ${t.clienteId} is null and ${t.domiciliarioId} is null and ${t.estado} <> 'en_camino')`,
    ),
    index('pedidos_cuenta_idx').on(t.cuentaId),
    uniqueIndex('pedidos_cuenta_ronda_uq').on(t.cuentaId, t.ronda),
  ],
)

export const pedidoItems = pgTable(
  'pedido_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pedidoId: uuid('pedido_id')
      .notNull()
      .references(() => pedidos.id, { onDelete: 'cascade' }),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id, { onDelete: 'restrict' }),
    nombre: text('nombre').notNull(),
    precioUnitario: integer('precio_unitario').notNull(),
    cantidad: integer('cantidad').notNull(),
    notas: text('notas'),
    subtotal: integer('subtotal').notNull(),
  },
  (t) => [index('pedido_items_pedido_idx').on(t.pedidoId), check('pedido_items_cantidad_ck', sql`${t.cantidad} > 0`)],
)

export const pedidoEventos = pgTable(
  'pedido_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pedidoId: uuid('pedido_id')
      .notNull()
      .references(() => pedidos.id, { onDelete: 'cascade' }),
    estado: text('estado', { enum: ESTADOS_PEDIDO_DB }).notNull(),
    actorId: uuid('actor_id').references(() => usuarios.id, { onDelete: 'set null' }),
    actorRol: text('actor_rol'),
    nota: text('nota'),
    creadoEn: creadoEn(),
  },
  (t) => [index('pedido_eventos_pedido_idx').on(t.pedidoId, t.creadoEn)],
)

export const pagos = pgTable(
  'pagos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Un pago es de un pedido a domicilio o de una cuenta de mesa (nunca de ambos).
    pedidoId: uuid('pedido_id').references(() => pedidos.id, { onDelete: 'cascade' }),
    cuentaId: uuid('cuenta_id').references(() => cuentasMesa.id, { onDelete: 'cascade' }),
    metodo: text('metodo', { enum: ['efectivo', 'qr'] }).notNull(),
    monto: integer('monto').notNull(),
    recibido: integer('recibido'),
    cambio: integer('cambio'),
    referencia: text('referencia'),
    registradoPor: uuid('registrado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('pagos_pedido_idx').on(t.pedidoId),
    index('pagos_cuenta_idx').on(t.cuentaId),
    check('pagos_monto_ck', sql`${t.monto} >= 0`),
    check('pagos_destino_ck', sql`(${t.pedidoId} is null) <> (${t.cuentaId} is null)`),
  ],
)

export const suscripcionesPush = pgTable(
  'suscripciones_push',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }),
    creadoEn: creadoEn(),
    ultimoUsoEn: ts('ultimo_uso_en'),
  },
  (t) => [uniqueIndex('suscripciones_endpoint_uq').on(t.endpoint), index('suscripciones_usuario_idx').on(t.usuarioId)],
)

export const pedidoSuscripciones = pgTable(
  'pedido_suscripciones',
  {
    pedidoId: uuid('pedido_id')
      .notNull()
      .references(() => pedidos.id, { onDelete: 'cascade' }),
    suscripcionId: uuid('suscripcion_id')
      .notNull()
      .references(() => suscripcionesPush.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.pedidoId, t.suscripcionId] })],
)

// ---------------------------------------------------------------------------
// Operación y gobierno
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Turnos del personal (hora de entrada y salida; la hora la pone el servidor)
// ---------------------------------------------------------------------------

export const turnos = pgTable(
  'turnos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'restrict' }),
    entradaEn: timestamp('entrada_en', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    salidaEn: ts('salida_en'),
    // Si el empleado olvidó marcar la salida, la pone el admin (queda quién y por qué).
    cerradoPor: uuid('cerrado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    nota: text('nota'),
  },
  (t) => [
    // A lo sumo un turno abierto por persona.
    uniqueIndex('turnos_abierto_uq').on(t.usuarioId).where(sql`${t.salidaEn} is null`),
    index('turnos_sede_entrada_idx').on(t.sedeId, t.entradaEn),
    index('turnos_usuario_entrada_idx').on(t.usuarioId, t.entradaEn),
    check('turnos_salida_ck', sql`${t.salidaEn} is null or ${t.salidaEn} > ${t.entradaEn}`),
  ],
)

// ---------------------------------------------------------------------------
// Pasaporte de sellos (programa de fidelidad, con autorización expresa del cliente)
// ---------------------------------------------------------------------------

/** Configuración del programa (una sola fila, id = 1). La crea la migración, apagada. */
export const pasaporteConfig = pgTable(
  'pasaporte_config',
  {
    id: integer('id').primaryKey(),
    activo: boolean('activo').notNull().default(false),
    sellosParaPremio: integer('sellos_para_premio').notNull().default(8),
    montoMinimo: integer('monto_minimo').notNull().default(0),
    premioProductoId: uuid('premio_producto_id').references(() => productos.id, { onDelete: 'set null' }),
    premioDescripcion: text('premio_descripcion'),
    vigenciaMeses: integer('vigencia_meses').notNull().default(6),
    actualizadoEn: actualizadoEn(),
    actualizadoPor: uuid('actualizado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  },
  (t) => [
    check('pasaporte_config_unica_ck', sql`${t.id} = 1`),
    check('pasaporte_config_valores_ck', sql`${t.sellosParaPremio} between 2 and 20 and ${t.montoMinimo} >= 0 and ${t.vigenciaMeses} between 0 and 36`),
  ],
)

/** Inscripción del cliente: su código personal y cuándo aceptó las condiciones (Ley 1581). */
export const pasaportes = pgTable(
  'pasaportes',
  {
    clienteId: uuid('cliente_id')
      .primaryKey()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    codigo: text('codigo').notNull(),
    aceptadoEn: timestamp('aceptado_en', { withTimezone: true, mode: 'date' }).notNull(),
    versionTerminos: text('version_terminos').notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex('pasaportes_codigo_uq').on(t.codigo)],
)

export const canjesPasaporte = pgTable(
  'canjes_pasaporte',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // null si el cliente salió del programa (el canje queda para la contabilidad del inventario, sin datos personales).
    clienteId: uuid('cliente_id').references(() => usuarios.id, { onDelete: 'set null' }),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'restrict' }),
    cuentaId: uuid('cuenta_id').references(() => cuentasMesa.id, { onDelete: 'set null' }),
    pedidoId: uuid('pedido_id').references(() => pedidos.id, { onDelete: 'set null' }),
    sellosUsados: integer('sellos_usados').notNull(),
    premioNombre: text('premio_nombre').notNull(),
    canjeadoPor: uuid('canjeado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    creadoEn: creadoEn(),
  },
  (t) => [index('canjes_pasaporte_cliente_idx').on(t.clienteId, t.creadoEn)],
)

/** Un sello por compra pagada: los índices únicos impiden sellar dos veces el mismo pedido o cuenta. */
export const sellos = pgTable(
  'sellos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    sedeId: uuid('sede_id')
      .notNull()
      .references(() => sedes.id, { onDelete: 'restrict' }),
    pedidoId: uuid('pedido_id').references(() => pedidos.id, { onDelete: 'restrict' }),
    cuentaId: uuid('cuenta_id').references(() => cuentasMesa.id, { onDelete: 'restrict' }),
    monto: integer('monto').notNull(),
    otorgadoPor: uuid('otorgado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    canjeId: uuid('canje_id').references(() => canjesPasaporte.id, { onDelete: 'set null' }),
    creadoEn: creadoEn(),
  },
  (t) => [
    check('sellos_compra_ck', sql`(${t.pedidoId} is null) <> (${t.cuentaId} is null)`),
    uniqueIndex('sellos_pedido_uq').on(t.pedidoId).where(sql`${t.pedidoId} is not null`),
    uniqueIndex('sellos_cuenta_uq').on(t.cuentaId).where(sql`${t.cuentaId} is not null`),
    index('sellos_cliente_idx').on(t.clienteId, t.creadoEn),
  ],
)

export const buzonMensajes = pgTable(
  'buzon_mensajes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: text('tipo', { enum: ['queja', 'sugerencia'] }).notNull(),
    mensaje: text('mensaje').notNull(),
    anonimo: boolean('anonimo').notNull(),
    // Si el mensaje es anónimo estas dos columnas quedan en NULL (lo exige un CHECK).
    autorId: uuid('autor_id').references(() => usuarios.id, { onDelete: 'set null' }),
    sedeId: uuid('sede_id').references(() => sedes.id, { onDelete: 'set null' }),
    estado: text('estado', { enum: ['nueva', 'en_revision', 'resuelta'] }).notNull().default('nueva'),
    /** Solo la fecha (sin hora) para no permitir cruzar turnos y adivinar el autor. */
    fecha: date('fecha', { mode: 'string' }).notNull(),
    actualizadoEn: ts('actualizado_en'),
  },
  (t) => [
    index('buzon_estado_idx').on(t.estado, t.fecha),
    check('buzon_anonimo_sin_autor_ck', sql`not ${t.anonimo} or (${t.autorId} is null and ${t.sedeId} is null)`),
  ],
)

export const auditoria = pgTable(
  'auditoria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => usuarios.id, { onDelete: 'set null' }),
    actorRol: text('actor_rol'),
    accion: text('accion').notNull(),
    entidad: text('entidad').notNull(),
    entidadId: text('entidad_id'),
    datos: jsonb('datos').$type<Record<string, unknown>>(),
    ip: text('ip'),
    creadoEn: creadoEn(),
  },
  (t) => [index('auditoria_fecha_idx').on(t.creadoEn), index('auditoria_entidad_idx').on(t.entidad, t.entidadId)],
)

export const whatsappMensajes = pgTable('whatsapp_mensajes', {
  wamid: text('wamid').primaryKey(),
  telefono: text('telefono').notNull(),
  tipo: text('tipo').notNull(),
  estado: text('estado', { enum: ['recibido', 'procesado', 'ignorado', 'error'] }).notNull().default('recibido'),
  recibidoEn: creadoEn(),
  procesadoEn: ts('procesado_en'),
})

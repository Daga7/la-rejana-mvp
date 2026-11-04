import './zod-navegador'
import { z } from 'zod'
import {
  FORMAS_MESA,
  PLANO_MAX,
  ESTADOS_BUZON,
  ESTADOS_PEDIDO,
  METODOS_PAGO,
  PERIODOS_REPORTE,
  ROLES_EMPLEADO,
  TIPOS_BUZON,
  TIPOS_REPORTE,
  UNIDADES,
} from './enums'
import { telefonoE164 } from './formato'

// ---------------------------------------------------------------------------
// Piezas reutilizables
// ---------------------------------------------------------------------------

export const correo = z
  .string({ error: 'Escribe tu correo' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo')
  .pipe(z.email({ error: 'Escribe un correo válido' }))

/** Política de contraseñas (OWASP ASVS 5.0 §6.2): 8–128 caracteres, sin reglas de composición. */
export const claveNueva = z
  .string({ error: 'Escribe una contraseña' })
  .min(8, 'Usa al menos 8 caracteres')
  .max(128, 'Usa máximo 128 caracteres')

export const nombrePersona = z.string({ error: 'Escribe tu nombre' }).trim().min(2, 'Escribe tu nombre').max(80, 'Máximo 80 caracteres')

export const telefono = z
  .string({ error: 'Escribe tu celular' })
  .trim()
  .max(20)
  .transform((valor, ctx) => {
    const e164 = telefonoE164(valor)
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'Escribe un celular colombiano válido (10 dígitos)' })
      return z.NEVER
    }
    return e164
  })

export const codigoSeisDigitos = z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos')

export const id = z.uuid({ error: 'Identificador inválido' })

export const latitud = z.number().min(-90).max(90)
export const longitud = z.number().min(-180).max(180)

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : undefined))

const horaHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM')

const pesos = z.int('Debe ser un valor entero en pesos').min(0, 'No puede ser negativo').max(50_000_000)

/** URL https o ruta local (/productos/x.webp) para imágenes. */
const urlImagen = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/') || /^https:\/\/[^\s]+$/.test(v), 'Usa una URL https o una ruta que empiece por /')

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------

export const registroSchema = z.object({
  nombre: nombrePersona,
  correo,
  clave: claveNueva,
  aceptaPrivacidad: z.literal(true, { error: 'Debes aceptar el aviso de privacidad' }),
})
export type RegistroInput = z.infer<typeof registroSchema>

export const ingresarSchema = z.object({
  correo,
  clave: z.string().min(1, 'Escribe tu contraseña').max(128),
})

export const verificarCorreoSchema = z.object({ correo, codigo: codigoSeisDigitos })
export const reenviarCodigoSchema = z.object({ correo })
export const recuperarClaveSchema = z.object({ correo })
export const restablecerClaveSchema = z.object({ correo, codigo: codigoSeisDigitos, claveNueva })
export const cambiarClaveSchema = z.object({ claveActual: z.string().min(1).max(128), claveNueva })

export const aceptarInvitacionSchema = z.object({
  nombre: nombrePersona,
  telefono: telefono.optional(),
  clave: claveNueva,
  aceptaPrivacidad: z.literal(true, { error: 'Debes aceptar el aviso de privacidad' }),
})

export const actualizarPerfilSchema = z.object({
  nombre: nombrePersona.optional(),
  telefono: telefono.optional().nullable(),
})

// ---------------------------------------------------------------------------
// Direcciones y pedidos
// ---------------------------------------------------------------------------

export const ubicacionEntregaSchema = z.object({
  direccion: z.string({ error: 'Escribe la dirección' }).trim().min(5, 'Escribe la dirección completa').max(160),
  detalle: textoOpcional(120),
  barrio: textoOpcional(80),
  lat: latitud,
  lng: longitud,
})

export const direccionClienteSchema = ubicacionEntregaSchema.extend({
  etiqueta: z.string().trim().min(1).max(40).default('Casa'),
})

export const itemPedidoSchema = z.object({
  productoId: id,
  cantidad: z.int().min(1, 'Mínimo 1').max(20, 'Máximo 20 unidades por producto'),
  notas: textoOpcional(140),
})

/** Un mismo producto con la misma nota no puede venir dos veces (se suma la cantidad). */
const sinRepetidos = (items: { productoId: string; notas?: string | undefined }[]) => new Set(items.map((i) => `${i.productoId}|${i.notas ?? ''}`)).size === items.length

export const crearPedidoSchema = z
  .object({
    sedeId: id,
    items: z.array(itemPedidoSchema).min(1, 'Tu carrito está vacío').max(30),
    contacto: z.object({ nombre: nombrePersona, telefono }),
    entrega: ubicacionEntregaSchema,
    notas: textoOpcional(300),
    metodoPago: z.enum(METODOS_PAGO, { error: 'Elige cómo vas a pagar' }),
    pagaCon: pesos.optional(),
    guardarDireccion: z.boolean().optional(),
    aceptaPrivacidad: z.boolean().optional(),
  })
  .refine((p) => sinRepetidos(p.items), { message: 'Hay productos repetidos en el carrito', path: ['items'] })
export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>

export const cambiarEstadoSchema = z.object({
  estado: z.enum(ESTADOS_PEDIDO),
  nota: textoOpcional(200),
})

export const cancelarPedidoSchema = z.object({
  motivo: z.string().trim().min(3, 'Cuéntanos el motivo').max(200),
  /** Solo personal: si los insumos vuelven al inventario (por defecto, sí cuando la comida no se alcanzó a preparar). */
  reponerInventario: z.boolean().optional(),
})

export const asignarDomiciliarioSchema = z.object({ domiciliarioId: id })

export const registrarPagoSchema = z.object({
  metodo: z.enum(METODOS_PAGO),
  monto: pesos,
  recibido: pesos.optional(),
  referencia: textoOpcional(80),
})

// ---------------------------------------------------------------------------
// Mesas (mesero y caja)
// ---------------------------------------------------------------------------

export const abrirCuentaSchema = z.object({
  mesaId: id,
  comensales: z.int('Escribe cuántas personas').min(1, 'Mínimo 1 persona').max(30, 'Máximo 30 personas'),
})

export const actualizarCuentaSchema = z
  .object({
    comensales: z.int().min(1, 'Mínimo 1 persona').max(30, 'Máximo 30 personas').optional(),
    /** true: la mesa pidió la cuenta (la caja la ve por cobrar); false: siguen pidiendo. */
    cuentaPedida: z.boolean().optional(),
  })
  .refine((c) => c.comensales !== undefined || c.cuentaPedida !== undefined, { message: 'No hay nada que cambiar' })

export const rondaSchema = z
  .object({
    items: z.array(itemPedidoSchema).min(1, 'Agrega al menos un producto').max(30),
    notas: textoOpcional(300),
  })
  .refine((r) => sinRepetidos(r.items), { message: 'Hay productos repetidos en la ronda', path: ['items'] })
export type RondaInput = z.infer<typeof rondaSchema>

/** Trasladar la cuenta a otra mesa, juntarle una mesa o separar una mesa unida. */
export const mesaDestinoSchema = z.object({ mesaId: id })

export const pagoCuentaSchema = z.object({
  metodo: z.enum(METODOS_PAGO),
  monto: pesos.min(1, 'El monto debe ser mayor que cero'),
  recibido: pesos.optional(),
  referencia: textoOpcional(80),
})

/** Cobro de una mesa en un solo paso: uno o varios pagos (cuenta dividida) y propina voluntaria. */
export const cobrarCuentaSchema = z.object({
  pagos: z.array(pagoCuentaSchema).min(1, 'Registra al menos un pago').max(6, 'Máximo 6 pagos por cuenta'),
  propina: pesos.default(0),
})
export type CobrarCuentaInput = z.infer<typeof cobrarCuentaSchema>

// ---------------------------------------------------------------------------
// Turnos del personal
// ---------------------------------------------------------------------------

export const filtroTurnosSchema = z.object({
  sedeId: id.optional(),
  periodo: z.enum(PERIODOS_REPORTE).default('esta_semana'),
})

/** El admin cierra un turno que el empleado olvidó cerrar, con la hora real de salida. */
export const cerrarTurnoSchema = z.object({
  salidaEn: z.iso.datetime({ offset: true, error: 'Escribe la hora de salida' }),
  nota: z.string().trim().min(3, 'Cuéntanos por qué lo cierras tú').max(200),
})

export const suscripcionPushSchema = z.object({
  endpoint: z.url({ protocol: /^https$/, error: 'Suscripción inválida' }).max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
  pedidoId: id.optional(),
})

export const ticketRealtimeSchema = z.object({ pedidoId: id.optional() })

// ---------------------------------------------------------------------------
// Domiciliario
// ---------------------------------------------------------------------------

export const planRutaSchema = z.object({ pedidoIds: z.array(id).min(1, 'Elige al menos un pedido').max(10, 'Máximo 10 pedidos por salida') })
export const iniciarRecorridoSchema = z.object({ pedidoIds: z.array(id).min(1).max(10) })
export const ubicacionSchema = z.object({
  lat: latitud,
  lng: longitud,
  precision: z.number().min(0).max(10_000).optional(),
  rumbo: z.number().min(0).max(360).optional().nullable(),
  velocidad: z.number().min(0).max(100).optional().nullable(),
})

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------

export const sedeSchema = z.object({
  nombre: z.string().trim().min(2).max(60),
  direccion: z.string().trim().min(5).max(160),
  barrio: z.string().trim().max(80).default(''),
  telefono: telefono,
  lat: latitud,
  lng: longitud,
  horaApertura: horaHHMM,
  horaCierre: horaHHMM,
  tarifaDomicilio: pesos,
  limiteMinutosEntrega: z.int().min(10).max(120),
  minutosPreparacion: z.int().min(5).max(120),
  radioEntregaKm: z.number().min(0.5).max(30),
  qrPagoUrl: urlImagen.optional().nullable(),
  qrPagoInstrucciones: z.string().trim().max(300).optional().nullable(),
  activa: z.boolean(),
})

const casilla = z.int().min(0).max(PLANO_MAX - 1)
const lado = z.int().min(1, 'Mínimo 1 casilla').max(4, 'Máximo 4 casillas')

export const mesaSchema = z
  .object({
    numero: z.int('Escribe el número de la mesa').min(1, 'Mínimo 1').max(999, 'Máximo 999'),
    /** Zona del salón (p. ej. "Terraza", "Segundo piso"): cada zona tiene su propio plano. */
    zona: z.string().trim().max(40, 'Máximo 40 caracteres').optional().nullable(),
    puestos: z.int().min(1, 'Mínimo 1 puesto').max(20, 'Máximo 20 puestos'),
    activa: z.boolean(),
    /** Posición en el plano (casillas). Si no se envía al crear, la mesa se ubica en el primer espacio libre. */
    x: casilla.optional(),
    y: casilla.optional(),
    ancho: lado.optional(),
    alto: lado.optional(),
    forma: z.enum(FORMAS_MESA).optional(),
  })
  .refine((m) => (m.x === undefined) === (m.y === undefined), { message: 'Envía las dos coordenadas de la mesa', path: ['x'] })
  .refine((m) => m.x === undefined || m.x + (m.ancho ?? 2) <= PLANO_MAX, { message: 'La mesa se sale del plano', path: ['x'] })
  .refine((m) => m.y === undefined || m.y + (m.alto ?? 2) <= PLANO_MAX, { message: 'La mesa se sale del plano', path: ['y'] })
export type MesaInput = z.infer<typeof mesaSchema>

export const categoriaSchema = z.object({
  nombre: z.string().trim().min(2).max(40),
  orden: z.int().min(0).max(999),
  activa: z.boolean(),
})

export const productoSchema = z.object({
  categoriaId: id,
  nombre: z.string().trim().min(2).max(60),
  descripcion: z.string().trim().max(300).default(''),
  imagenUrl: urlImagen.optional().nullable(),
  activo: z.boolean(),
})

export const recetaSchema = z.object({
  items: z
    .array(z.object({ insumoId: id, cantidad: z.number().positive('La cantidad debe ser mayor que cero').max(100_000) }))
    .max(40)
    .refine((items) => new Set(items.map((i) => i.insumoId)).size === items.length, 'Hay insumos repetidos en la receta'),
})

export const menuSedeSchema = z.object({
  precio: pesos,
  disponible: z.boolean(),
  orden: z.int().min(0).max(999).default(0),
})

export const insumoSchema = z.object({
  nombre: z.string().trim().min(2).max(60),
  unidad: z.enum(UNIDADES),
  activo: z.boolean(),
})

export const movimientoInventarioSchema = z.object({
  sedeId: id,
  insumoId: id,
  /** sumar = entrada de mercancía; fijar = conteo físico (deja el saldo en ese valor). */
  modo: z.enum(['sumar', 'fijar']),
  cantidad: z.number().min(0).max(10_000_000),
  nota: textoOpcional(200),
})

export const stockMinimoSchema = z.object({
  sedeId: id,
  insumoId: id,
  stockMinimo: z.number().min(0).max(10_000_000),
})

export const invitacionSchema = z
  .object({
    correo,
    rol: z.enum(ROLES_EMPLEADO),
    sedeId: id.nullable(),
  })
  .refine((v) => v.rol === 'admin' || v.sedeId !== null, { message: 'Elige la sede del empleado', path: ['sedeId'] })

export const actualizarEmpleadoSchema = z.object({
  rol: z.enum(ROLES_EMPLEADO).optional(),
  sedeId: id.nullable().optional(),
  activo: z.boolean().optional(),
  telefono: telefono.optional().nullable(),
  whatsappHabilitado: z.boolean().optional(),
})

export const buzonSchema = z.object({
  tipo: z.enum(TIPOS_BUZON),
  mensaje: z.string().trim().min(10, 'Escribe al menos 10 caracteres').max(2000, 'Máximo 2000 caracteres'),
  anonimo: z.boolean(),
})

export const estadoBuzonSchema = z.object({ estado: z.enum(ESTADOS_BUZON) })

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa AAAA-MM-DD')

export const consultaReporteSchema = z.object({
  sedeId: z.union([id, z.literal('todas')]).default('todas'),
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
  periodo: z.enum(PERIODOS_REPORTE).optional(),
})

/** Solicitud estructurada de reporte (lo único que la IA puede producir). */
export const solicitudReporteSchema = z.object({
  tipo: z.enum(TIPOS_REPORTE),
  sede: z.string().max(60).nullable(),
  periodo: z.enum(PERIODOS_REPORTE).nullable(),
  desde: fechaISO.nullable(),
  hasta: fechaISO.nullable(),
  insumo: z.string().max(60).nullable(),
})
export type SolicitudReporte = z.infer<typeof solicitudReporteSchema>

export const probarAsistenteSchema = z.object({ texto: z.string().trim().min(3).max(500) })

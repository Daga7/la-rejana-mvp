import { z } from 'zod'
import {
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
  .refine((p) => new Set(p.items.map((i) => `${i.productoId}|${i.notas ?? ''}`)).size === p.items.length, {
    message: 'Hay productos repetidos en el carrito',
    path: ['items'],
  })
export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>

export const cambiarEstadoSchema = z.object({
  estado: z.enum(ESTADOS_PEDIDO),
  nota: textoOpcional(200),
})

export const cancelarPedidoSchema = z.object({
  motivo: z.string().trim().min(3, 'Cuéntanos el motivo').max(200),
})

export const asignarDomiciliarioSchema = z.object({ domiciliarioId: id })

export const registrarPagoSchema = z.object({
  metodo: z.enum(METODOS_PAGO),
  monto: pesos,
  recibido: pesos.optional(),
  referencia: textoOpcional(80),
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

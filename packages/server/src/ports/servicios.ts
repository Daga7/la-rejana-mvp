import type { PedidoDTO, ProveedorOAuth, Punto, Rol, SolicitudReporte, UbicacionEnVivoDTO } from '@rejana/shared'

// Puertos hacia el mundo exterior. Cada uno tiene al menos un adaptador real y uno de desarrollo (mock).

export interface Reloj {
  ahora(): Date
}

export interface Logger {
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
  debug(obj: unknown, msg?: string): void
}

// --- Seguridad --------------------------------------------------------------------

export interface HasherClaves {
  hash(clave: string): Promise<string>
  verificar(clave: string, hash: string): Promise<boolean>
  /** true si el hash usa un formato o costo antiguo y conviene recalcularlo al iniciar sesión. */
  necesitaActualizar?(hash: string): boolean
}

/** Consulta de contraseñas filtradas (p. ej. Have I Been Pwned con k-anonimato). */
export interface VerificadorClavesFiltradas {
  estaFiltrada(clave: string): Promise<boolean>
}

export interface Criptografia {
  /** Token aleatorio en base64url (por defecto 32 bytes). */
  tokenAleatorio(bytes?: number): string
  /** Código numérico uniforme (sin sesgo de módulo). */
  codigoNumerico(digitos: number): string
  /** Código aleatorio uniforme con los símbolos de `alfabeto`. */
  codigoAlfabeto(alfabeto: string, largo: number): string
  /** HMAC-SHA256 con la pimienta del servidor; se usa para guardar tokens y códigos. */
  huella(valor: string): string
  compararSeguro(a: string, b: string): boolean
}

export interface ClaimsAcceso {
  sub: string
  rol: Rol
  sede: string | null
  sid: string
}

export interface EmisorTokens {
  firmarAcceso(claims: ClaimsAcceso, minutos: number): Promise<string>
  verificarAcceso(token: string): Promise<ClaimsAcceso>
  firmarEstadoOAuth(datos: Record<string, string>, segundos: number): Promise<string>
  verificarEstadoOAuth(token: string): Promise<Record<string, string>>
}

// --- Comunicaciones ------------------------------------------------------------------

export interface MensajeCorreo {
  para: string
  asunto: string
  texto: string
  html: string
}

export interface ServicioCorreo {
  enviar(mensaje: MensajeCorreo): Promise<void>
}

export interface NotificacionPush {
  titulo: string
  cuerpo: string
  url: string
  etiqueta: string
}

export interface DestinoPush {
  endpoint: string
  p256dh: string
  auth: string
}

export interface Notificador {
  readonly clavePublica: string | null
  /** 'expirada' indica que el navegador revocó la suscripción y debe borrarse. */
  enviar(destino: DestinoPush, notificacion: NotificacionPush): Promise<'ok' | 'expirada' | 'error'>
}

/** Eventos en tiempo real hacia las pantallas (Supabase Realtime). */
export interface PublicadorEventos {
  pedidoActualizado(pedido: PedidoDTO): void
  ubicacion(pedidoId: string, datos: UbicacionEnVivoDTO): void
  finUbicacion(pedidoId: string): void
  inventarioBajo(sedeId: string, datos: { insumoId: string; insumoNombre: string; cantidad: number; stockMinimo: number }): void
  menuCambio(sedeId: string): void
  /** Cambió una cuenta de mesa (abierta, pidió la cuenta, cobrada…): el salón y la caja se refrescan. */
  cuentaActualizada(sedeId: string, cuentaId: string): void
}

// --- Mapas -------------------------------------------------------------------------

export interface MatrizTiempos {
  /** Minutos de viaje entre todos los pares de puntos (matriz cuadrada). */
  minutos(puntos: Punto[]): Promise<number[][]>
}

export interface ResultadoGeo {
  etiqueta: string
  lat: number
  lng: number
}

export interface Geocodificador {
  buscar(texto: string, cerca: Punto): Promise<ResultadoGeo[]>
  inverso(punto: Punto): Promise<string | null>
}

// --- Identidad externa ------------------------------------------------------------------

export interface PerfilOAuth {
  proveedor: ProveedorOAuth
  sujeto: string
  email: string
  emailVerificado: boolean
  nombre: string | null
}

export interface ProveedorIdentidad {
  readonly proveedor: ProveedorOAuth
  /** URL a la que se redirige al usuario para autorizar. */
  urlAutorizacion(p: { state: string; nonce: string; codeChallenge: string; redirectUri: string }): string
  /** Intercambia el código por la identidad verificada (firma, audiencia, emisor y nonce). */
  intercambiar(p: { code: string; codeVerifier: string; nonce: string; redirectUri: string; usuarioApple?: string | null }): Promise<PerfilOAuth>
}

// --- Asistente de WhatsApp ----------------------------------------------------------------

export interface MensajeriaWhatsApp {
  enviarTexto(para: string, texto: string): Promise<void>
  enviarDocumento(para: string, documento: Buffer, nombreArchivo: string, leyenda: string): Promise<void>
  descargarMedia(mediaId: string): Promise<{ datos: Buffer; mime: string }>
  /** Verifica X-Hub-Signature-256 sobre el cuerpo crudo. */
  firmaValida(cuerpoCrudo: Buffer, firma: string | undefined): boolean
}

export interface Transcriptor {
  transcribir(audio: Buffer, mime: string): Promise<string>
}

export interface ContextoInterpretacion {
  /** Fecha de hoy en Bogotá (AAAA-MM-DD). */
  hoy: string
  sedes: string[]
  insumos: string[]
}

export type ResultadoInterpretacion = { tipo: 'reporte'; solicitud: SolicitudReporte } | { tipo: 'aclaracion'; mensaje: string }

/** Convierte lenguaje natural en una solicitud del catálogo cerrado de reportes (nunca SQL). */
export interface InterpreteSolicitudes {
  interpretar(texto: string, contexto: ContextoInterpretacion): Promise<ResultadoInterpretacion>
}

// --- Documentos ---------------------------------------------------------------------------

export interface SerieGrafica {
  nombre: string
  valores: number[]
}

export interface DocumentoReporte {
  titulo: string
  subtitulo: string
  generadoEn: Date
  indicadores: { etiqueta: string; valor: string }[]
  grafica?: {
    tipo: 'barras' | 'lineas' | 'barras_horizontales'
    titulo: string
    etiquetas: string[]
    series: SerieGrafica[]
    formato: 'pesos' | 'numero'
  }
  tabla: { titulo: string; columnas: { titulo: string; alineacion?: 'izquierda' | 'derecha' }[]; filas: string[][] }
  notas?: string[]
}

export interface GeneradorPdf {
  generar(documento: DocumentoReporte): Promise<Buffer>
}

// --- Pagos en línea (fuera del MVP: puerto preparado para Wompi) ----------------------------

export interface PasarelaPagos {
  crearTransaccion(p: { referencia: string; montoCentavos: number; correo: string; redireccion: string }): Promise<{ urlPago: string }>
  verificarEvento(cuerpoCrudo: Buffer, firma: string | undefined): Promise<{ referencia: string; aprobado: boolean } | null>
}

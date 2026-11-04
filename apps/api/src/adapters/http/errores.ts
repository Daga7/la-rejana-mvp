import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { ErrorDominio, type CodigoError } from '../../domain/errores'

const STATUS: Record<CodigoError, number> = {
  NO_AUTENTICADO: 401,
  TOKEN_INVALIDO: 401,
  CREDENCIALES_INVALIDAS: 401,
  PROHIBIDO: 403,
  CUENTA_INACTIVA: 403,
  CORREO_NO_VERIFICADO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  STOCK_INSUFICIENTE: 409,
  TRANSICION_INVALIDA: 409,
  PRODUCTO_NO_DISPONIBLE: 409,
  SEDE_NO_DISPONIBLE: 409,
  VALIDACION: 422,
  CODIGO_INVALIDO: 422,
  CODIGO_EXPIRADO: 422,
  CLAVE_DEBIL: 422,
  FUERA_DE_COBERTURA: 422,
  CUENTA_BLOQUEADA: 423,
  DEMASIADOS_INTENTOS: 429,
  ESPERA_REENVIO: 429,
  SERVICIO_NO_DISPONIBLE: 503,
}

export function cuerpoError(codigo: string, mensaje: string, extra: Record<string, unknown> = {}) {
  return { error: { codigo, mensaje, ...extra } }
}

export function manejarError(error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ErrorDominio) {
    const status = STATUS[error.codigo] ?? 400
    if (status >= 500) req.log.error({ err: error }, 'Error de dominio')
    return reply.status(status).send(cuerpoError(error.codigo, error.message, error.detalles ? { detalles: error.detalles } : {}))
  }
  if (error instanceof ZodError) {
    const campos: Record<string, string[]> = {}
    for (const issue of error.issues) {
      const clave = issue.path.join('.') || '_'
      ;(campos[clave] ??= []).push(issue.message)
    }
    const primero = error.issues[0]?.message ?? 'Datos inválidos'
    return reply.status(400).send(cuerpoError('VALIDACION', primero, { campos }))
  }
  const fe = error as FastifyError
  if (fe.statusCode === 429) {
    return reply.status(429).send(cuerpoError('DEMASIADOS_INTENTOS', 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.'))
  }
  if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
    const mensaje = fe.code === 'FST_ERR_CTP_BODY_TOO_LARGE' ? 'La solicitud es demasiado grande' : 'Solicitud inválida'
    return reply.status(fe.statusCode).send(cuerpoError('SOLICITUD_INVALIDA', mensaje))
  }
  req.log.error({ err: error }, 'Error no controlado')
  // Nunca se filtran detalles internos al cliente.
  return reply.status(500).send(cuerpoError('ERROR_INTERNO', 'Algo salió mal. Inténtalo de nuevo en un momento.'))
}

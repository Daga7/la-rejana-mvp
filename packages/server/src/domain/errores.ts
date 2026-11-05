export type CodigoError =
  | 'NO_AUTENTICADO'
  | 'PROHIBIDO'
  | 'NO_ENCONTRADO'
  | 'CONFLICTO'
  | 'VALIDACION'
  | 'CREDENCIALES_INVALIDAS'
  | 'CUENTA_BLOQUEADA'
  | 'CUENTA_INACTIVA'
  | 'CORREO_NO_VERIFICADO'
  | 'CODIGO_INVALIDO'
  | 'CODIGO_EXPIRADO'
  | 'DEMASIADOS_INTENTOS'
  | 'ESPERA_REENVIO'
  | 'CLAVE_DEBIL'
  | 'TOKEN_INVALIDO'
  | 'STOCK_INSUFICIENTE'
  | 'TRANSICION_INVALIDA'
  | 'FUERA_DE_COBERTURA'
  | 'SEDE_NO_DISPONIBLE'
  | 'PRODUCTO_NO_DISPONIBLE'
  | 'SERVICIO_NO_DISPONIBLE'

/** Error de negocio con un código estable que el adaptador HTTP traduce a un status. */
export class ErrorDominio extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
    readonly detalles?: Record<string, unknown>,
  ) {
    super(mensaje)
    this.name = 'ErrorDominio'
  }
}

export const err = {
  noAutenticado: (m = 'Inicia sesión para continuar') => new ErrorDominio('NO_AUTENTICADO', m),
  prohibido: (m = 'No tienes permiso para hacer esto') => new ErrorDominio('PROHIBIDO', m),
  noEncontrado: (m = 'No encontramos lo que buscas') => new ErrorDominio('NO_ENCONTRADO', m),
  conflicto: (m: string, d?: Record<string, unknown>) => new ErrorDominio('CONFLICTO', m, d),
  validacion: (m: string, d?: Record<string, unknown>) => new ErrorDominio('VALIDACION', m, d),
}

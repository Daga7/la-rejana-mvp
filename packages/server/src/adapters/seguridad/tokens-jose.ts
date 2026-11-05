import { createHmac } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'
import type { ClaimsAcceso, EmisorTokens } from '../../ports/servicios'

const EMISOR = 'rejana-api'

/** Deriva una llave distinta por propósito a partir del secreto maestro (separación de dominios). */
function derivar(secreto: string, proposito: string): Uint8Array {
  return new Uint8Array(createHmac('sha256', secreto).update(`rejana:${proposito}`).digest())
}

export function emisorTokensJose(secreto: string): EmisorTokens {
  const kAcceso = derivar(secreto, 'acceso')
  const kOAuth = derivar(secreto, 'estado-oauth')
  const opciones = (aud: string) => ({ issuer: EMISOR, audience: aud, algorithms: ['HS256'], clockTolerance: 5 })

  return {
    async firmarAcceso(c, minutos) {
      return new SignJWT({ rol: c.rol, sede: c.sede, sid: c.sid })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(c.sub)
        .setIssuer(EMISOR)
        .setAudience('acceso')
        .setIssuedAt()
        .setExpirationTime(`${minutos}m`)
        .sign(kAcceso)
    },
    async verificarAcceso(token) {
      const { payload } = await jwtVerify(token, kAcceso, opciones('acceso'))
      return { sub: String(payload.sub), rol: payload.rol as ClaimsAcceso['rol'], sede: (payload.sede as string | null) ?? null, sid: String(payload.sid) }
    },
    async firmarEstadoOAuth(datos, segundos) {
      return new SignJWT({ d: datos })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(EMISOR)
        .setAudience('oauth')
        .setIssuedAt()
        .setExpirationTime(`${segundos}s`)
        .sign(kOAuth)
    },
    async verificarEstadoOAuth(token) {
      const { payload } = await jwtVerify(token, kOAuth, opciones('oauth'))
      return (payload.d ?? {}) as Record<string, string>
    },
  }
}

import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose'
import { ErrorDominio } from '../../domain/errores'
import type { PerfilOAuth, ProveedorIdentidad } from '../../ports/servicios'

const fallo = (detalle: string) => new ErrorDominio('NO_AUTENTICADO', `No pudimos verificar tu identidad (${detalle}). Inténtalo de nuevo.`)

async function postFormulario(url: string, campos: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(campos),
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string }
  if (!res.ok || !json.id_token) throw fallo(json.error ?? `respuesta ${res.status}`)
  return json.id_token
}

// --- Google (OpenID Connect con PKCE) ---------------------------------------------------------

export function proveedorGoogle(clientId: string, clientSecret: string): ProveedorIdentidad {
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
  return {
    proveedor: 'google',
    urlAutorizacion({ state, nonce, codeChallenge, redirectUri }) {
      const p = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      })
      return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
    },
    async intercambiar({ code, codeVerifier, nonce, redirectUri }) {
      const idToken = await postFormulario('https://oauth2.googleapis.com/token', {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      })
      const { payload } = await jwtVerify(idToken, jwks, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId }).catch(() => {
        throw fallo('firma inválida')
      })
      if (payload.nonce !== nonce) throw fallo('nonce')
      if (typeof payload.email !== 'string' || !payload.sub) throw fallo('sin correo')
      return {
        proveedor: 'google',
        sujeto: payload.sub,
        email: payload.email,
        emailVerificado: payload.email_verified === true,
        nombre: typeof payload.name === 'string' ? payload.name : null,
      }
    },
  }
}

// --- Apple (Sign in with Apple, response_mode=form_post) --------------------------------------

export function proveedorApple(o: { clientId: string; teamId: string; keyId: string; llavePrivada: string }): ProveedorIdentidad {
  const jwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))
  const pem = o.llavePrivada.replace(/\\n/g, '\n')
  /** Apple exige como client_secret un JWT ES256 firmado con la llave .p8 (máx. 6 meses). */
  async function secretoCliente() {
    const llave = await importPKCS8(pem, 'ES256')
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: o.keyId })
      .setIssuer(o.teamId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setAudience('https://appleid.apple.com')
      .setSubject(o.clientId)
      .sign(llave)
  }
  return {
    proveedor: 'apple',
    urlAutorizacion({ state, nonce, redirectUri }) {
      const p = new URLSearchParams({
        client_id: o.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'name email',
        response_mode: 'form_post',
        state,
        nonce,
      })
      return `https://appleid.apple.com/auth/authorize?${p}`
    },
    async intercambiar({ code, nonce, redirectUri, usuarioApple }) {
      const idToken = await postFormulario('https://appleid.apple.com/auth/token', {
        client_id: o.clientId,
        client_secret: await secretoCliente(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      })
      const { payload } = await jwtVerify(idToken, jwks, { issuer: 'https://appleid.apple.com', audience: o.clientId }).catch(() => {
        throw fallo('firma inválida')
      })
      if (payload.nonce !== nonce) throw fallo('nonce')
      if (typeof payload.email !== 'string' || !payload.sub) throw fallo('sin correo')
      // Apple solo envía el nombre la primera vez, en el campo "user" del formulario.
      let nombre: string | null = null
      try {
        const u = usuarioApple ? (JSON.parse(usuarioApple) as { name?: { firstName?: string; lastName?: string } }) : null
        nombre = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(' ').slice(0, 80) || null
      } catch {
        nombre = null
      }
      return {
        proveedor: 'apple',
        sujeto: payload.sub,
        email: payload.email,
        emailVerificado: payload.email_verified === true || payload.email_verified === 'true',
        nombre,
      }
    },
  }
}

// --- Simulador para desarrollo (OAUTH_MOCK=true; prohibido en producción) ---------------------

/**
 * Imita el flujo completo (redirección, state, nonce, intercambio de código) sin credenciales reales.
 * El "código" es un JWT firmado por la propia API con el perfil elegido en la pantalla simulada.
 */
export function proveedorSimulado(proveedor: 'google' | 'apple', firmar: (p: PerfilOAuth & { nonce: string }) => Promise<string>, verificar: (code: string) => Promise<PerfilOAuth & { nonce: string }>, baseApi: string): ProveedorIdentidad & { firmarCodigo: typeof firmar } {
  return {
    proveedor,
    firmarCodigo: firmar,
    urlAutorizacion({ state, nonce, redirectUri }) {
      const p = new URLSearchParams({ proveedor, state, nonce, redirect_uri: redirectUri })
      return `${baseApi}/api/auth/oauth/simulado/autorizar?${p}`
    },
    async intercambiar({ code, nonce }) {
      const perfil = await verificar(code).catch(() => {
        throw fallo('código simulado inválido')
      })
      if (perfil.nonce !== nonce || perfil.proveedor !== proveedor) throw fallo('nonce')
      return { proveedor, sujeto: perfil.sujeto, email: perfil.email, emailVerificado: true, nombre: perfil.nombre }
    },
  }
}

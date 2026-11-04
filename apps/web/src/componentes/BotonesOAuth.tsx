'use client'

import type { ProveedoresOAuth } from '@/lib/api-servidor'

function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function LogoApple() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.97.9-3.76 2.28-1.61 2.79-.41 6.91 1.15 9.17.77 1.1 1.68 2.34 2.87 2.3 1.16-.05 1.59-.74 2.99-.74 1.39 0 1.79.74 3.01.72 1.24-.02 2.03-1.12 2.78-2.23.88-1.28 1.24-2.53 1.26-2.59-.03-.01-2.42-.93-2.46-3.69zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.09 1.76-.96 2.79 1.02.08 2.06-.52 2.69-1.27z" />
    </svg>
  )
}

export const hayOAuth = (p: ProveedoresOAuth) => p.google || p.apple

/**
 * Botones de Google y Apple. Son enlaces normales: el flujo OAuth arranca en la API (vía /api) con
 * state, nonce y PKCE, y vuelve con la sesión ya creada. Solo aparecen los proveedores configurados en la API.
 */
export function BotonesOAuth({ proveedores, volver, invitacion, texto = 'Continuar con' }: { proveedores: ProveedoresOAuth; volver?: string; invitacion?: string; texto?: string }) {
  const q = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams()
    for (const [k, v] of Object.entries(p)) if (v) s.set(k, v)
    const t = s.toString()
    return t ? `?${t}` : ''
  }
  const params = q({ volver, invitacion })
  return (
    <div className="grid gap-3">
      {/* Navegación completa (no fetch): el proveedor necesita la página entera. */}
      {proveedores.google && (
        <a href={`/api/auth/oauth/google${params}`} className="btn btn-blanco btn-lg w-full">
          <LogoGoogle /> {texto} Google
        </a>
      )}
      {proveedores.apple && (
        <a href={`/api/auth/oauth/apple${params}`} className="btn btn-lg w-full !bg-tinta !text-white">
          <LogoApple /> {texto} Apple
        </a>
      )}
    </div>
  )
}

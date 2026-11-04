import { NextResponse, type NextRequest } from 'next/server'

// CSP estricta con nonce por solicitud (OWASP ASVS §3.4). Next.js aplica el nonce a sus propios scripts.
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const dev = process.env.NODE_ENV === 'development'

  const tiempoReal = process.env.API_PUBLIC_URL ?? ''
  const conexiones = ["'self'"]
  const teselas = process.env.MAPA_TESELAS_URL
  if (tiempoReal) {
    const u = new URL(tiempoReal)
    conexiones.push(u.origin, `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`)
  }
  if (teselas) conexiones.push(new URL(teselas.replace(/\{[a-z]\}/g, '0')).origin)
  if (dev) conexiones.push('ws://localhost:*', 'http://localhost:*')

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Estilos en línea: los usan React (atributo style) y las animaciones; no ejecutan código.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${conexiones.join(' ')}`,
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')

  const cabeceras = new Headers(request.headers)
  cabeceras.set('x-nonce', nonce)
  cabeceras.set('Content-Security-Policy', csp)
  const respuesta = NextResponse.next({ request: { headers: cabeceras } })
  respuesta.headers.set('Content-Security-Policy', csp)
  return respuesta
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|sw\\.js|manifest\\.webmanifest|marca|estados|productos|iconos|pagos|favicon).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}

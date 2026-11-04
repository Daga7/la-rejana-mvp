import path from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

// En desarrollo las variables viven en el .env de la raíz del monorepo.
const raiz = path.resolve(process.cwd(), '../..')
loadEnvConfig(raiz)

const cabecerasSeguridad = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // La ubicación solo la usa la propia app (checkout y domiciliario).
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
]

// Identifica cada despliegue (versión del service worker).
const SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERSION_APP
const VERSION_APP = SHA ? SHA.slice(0, 12) : `local-${Date.now().toString(36)}`

const nextConfig: NextConfig = {
  env: { VERSION_APP },
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: raiz,
  transpilePackages: ['@rejana/shared'],
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: raiz,
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
  async headers() {
    return [
      { source: '/:ruta*', headers: cabecerasSeguridad },
      { source: '/(marca|estados|productos|iconos|pagos)/:archivo*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
    ]
  },
}

export default nextConfig

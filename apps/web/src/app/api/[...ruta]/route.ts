import type { NextRequest } from 'next/server'
import { obtenerApp } from '@/lib/servidor-api'

// La API corre en el mismo proceso que la web (Vercel): sin proxy ni segundo salto de red, la cookie
// de sesión ya es de primera parte y la IP del cliente llega directo en X-Forwarded-For de la plataforma.
export const runtime = 'nodejs'
// El tiempo real (/api/realtime/stream) necesita una conexión abierta más allá del límite por defecto.
export const maxDuration = 300

async function manejar(req: NextRequest) {
  const { app } = await obtenerApp()
  return app.handle(req)
}

export { manejar as GET, manejar as POST, manejar as PUT, manejar as PATCH, manejar as DELETE }

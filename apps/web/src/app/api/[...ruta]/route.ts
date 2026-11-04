import type { NextRequest } from 'next/server'
import { ipCliente } from '@/lib/ip-cliente'

// Proxy same-origin hacia la API. Así las cookies de sesión son de primera parte aunque la web y la API
// vivan en dominios distintos (Vercel + Railway), y la API recibe la IP real del cliente para el rate limiting.

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'
const SECRETO = process.env.PROXY_SHARED_SECRET ?? ''

const CABECERAS_ENTRADA = ['content-type', 'cookie', 'x-csrf-token', 'idempotency-key', 'x-pedido-token', 'user-agent', 'accept', 'accept-language', 'origin', 'sec-fetch-site', 'x-hub-signature-256']
const CABECERAS_EXCLUIDAS_SALIDA = new Set(['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive'])

async function reenviar(req: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await ctx.params
  // Sin segmentos «.» o «..»: el proxy solo alcanza rutas bajo /api de la API, nunca otras.
  if (ruta.some((s) => s === '' || s === '.' || s === '..')) {
    return Response.json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' } }, { status: 404 })
  }
  const destino = new URL(`/api/${ruta.map(encodeURIComponent).join('/')}${req.nextUrl.search}`, API)

  const cabeceras = new Headers()
  for (const nombre of CABECERAS_ENTRADA) {
    const valor = req.headers.get(nombre)
    if (valor) cabeceras.set(nombre, valor)
  }
  cabeceras.set('x-rejana-proxy-secret', SECRETO)
  cabeceras.set('x-rejana-client-ip', ipCliente(req.headers))

  const conCuerpo = !['GET', 'HEAD'].includes(req.method)
  let respuesta: Response
  try {
    respuesta = await fetch(destino, {
      method: req.method,
      headers: cabeceras,
      body: conCuerpo ? req.body : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      // Necesario para reenviar el cuerpo como stream en Node.
      ...(conCuerpo ? { duplex: 'half' } : {}),
    } as RequestInit)
  } catch {
    return Response.json({ error: { codigo: 'SIN_CONEXION_API', mensaje: 'No pudimos conectarnos con el servidor. Revisa tu conexión e inténtalo de nuevo.' } }, { status: 502 })
  }

  const salida = new Headers()
  respuesta.headers.forEach((valor, nombre) => {
    if (!CABECERAS_EXCLUIDAS_SALIDA.has(nombre)) salida.set(nombre, valor)
  })
  for (const cookie of respuesta.headers.getSetCookie()) salida.append('set-cookie', cookie)
  return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers: salida })
}

export { reenviar as GET, reenviar as POST, reenviar as PUT, reenviar as PATCH, reenviar as DELETE }

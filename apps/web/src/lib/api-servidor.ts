import { headers } from 'next/headers'
import { ipCliente } from './ip-cliente'

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

/**
 * GET a la API desde el servidor de Next, solo para datos públicos (sedes y menú) que se envían ya
 * renderizados en el HTML. Reenvía la IP del cliente (con el secreto del proxy) para que el límite de
 * solicitudes de la API siga siendo por cliente. Nunca lanza: si falla o tarda, devuelve null y la página
 * carga los datos desde el navegador como antes.
 */
export async function obtenerEnServidor<T>(ruta: string, msTimeout = 2500): Promise<T | null> {
  try {
    const res = await fetch(new URL(`/api${ruta}`, API), {
      headers: {
        accept: 'application/json',
        'x-rejana-proxy-secret': process.env.PROXY_SHARED_SECRET ?? '',
        'x-rejana-client-ip': ipCliente(await headers()),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(msTimeout),
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

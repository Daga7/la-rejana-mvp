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

export interface ProveedoresOAuth {
  google: boolean
  apple: boolean
}

/**
 * Qué botones de Google y Apple mostrar: la API dice cuáles tienen credenciales (sin ellas, el botón
 * solo llevaría a un error). La respuesta se guarda 2 minutos en la caché de Next; si la API no responde,
 * no se muestra ninguno y se puede entrar con correo y contraseña.
 */
export async function proveedoresOAuth(): Promise<ProveedoresOAuth> {
  try {
    const res = await fetch(new URL('/api/auth/proveedores', API), { headers: { accept: 'application/json' }, next: { revalidate: 120 }, signal: AbortSignal.timeout(2500) })
    if (!res.ok) return { google: false, apple: false }
    const d = (await res.json()) as Partial<ProveedoresOAuth>
    return { google: d.google === true, apple: d.apple === true }
  } catch {
    return { google: false, apple: false }
  }
}

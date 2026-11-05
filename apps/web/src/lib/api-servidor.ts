import { headers } from 'next/headers'
import { obtenerApp } from './servidor-api'

/**
 * GET en proceso a la propia API, solo para datos públicos (sedes y menú) que se envían ya
 * renderizados en el HTML. Sin red: llama directo al enrutador con una Request sintética. Nunca
 * lanza: si falla, devuelve null y la página carga los datos desde el navegador como antes.
 */
export async function obtenerEnServidor<T>(ruta: string, msTimeout = 2500): Promise<T | null> {
  try {
    const { app } = await obtenerApp()
    const h = await headers()
    const peticion = new Request(new URL(`/api${ruta}`, 'http://localhost'), {
      headers: { accept: 'application/json', cookie: h.get('cookie') ?? '', 'x-forwarded-for': h.get('x-forwarded-for') ?? '' },
      signal: AbortSignal.timeout(msTimeout),
    })
    const res = await app.handle(peticion)
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
 * solo llevaría a un error). Si la API no responde, no se muestra ninguno y se puede entrar con correo
 * y contraseña.
 */
export async function proveedoresOAuth(): Promise<ProveedoresOAuth> {
  try {
    const { app } = await obtenerApp()
    const res = await app.handle(new Request('http://localhost/api/auth/proveedores', { headers: { accept: 'application/json' } }))
    if (!res.ok) return { google: false, apple: false }
    const d = (await res.json()) as Partial<ProveedoresOAuth>
    return { google: d.google === true, apple: d.apple === true }
  } catch {
    return { google: false, apple: false }
  }
}

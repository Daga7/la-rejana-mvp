import { isIP } from 'node:net'

/**
 * IP del cliente según el proxy de la plataforma (Vercel). La entrada más a la derecha de X-Forwarded-For
 * es la que agregó el proxy; las anteriores las puede inventar el cliente.
 */
export function ipDelCliente(cabeceras: Record<string, string | undefined>): string {
  const xff = cabeceras['x-forwarded-for']
  const candidata = xff?.split(',').map((s) => s.trim()).filter(Boolean).at(-1) ?? cabeceras['x-real-ip']?.trim() ?? '127.0.0.1'
  const limpia = candidata.replace(/^::ffff:/, '')
  return isIP(limpia) ? limpia : '127.0.0.1'
}

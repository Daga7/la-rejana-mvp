// IP del cliente según el proxy de la plataforma. Vercel y Railway la ponen en X-Forwarded-For; la entrada
// más a la derecha es la que agregó el proxy de la plataforma (las demás las puede inventar el cliente).
export function ipCliente(cabeceras: Headers): string {
  const xff = cabeceras.get('x-forwarded-for')
  const candidata = xff?.split(',').map((s) => s.trim()).filter(Boolean).at(-1) ?? cabeceras.get('x-real-ip') ?? '127.0.0.1'
  return candidata.replace(/^::ffff:/, '')
}

import { createHash } from 'node:crypto'
import type { Logger, VerificadorClavesFiltradas } from '../../ports/servicios'

/**
 * Consulta Have I Been Pwned con k-anonimato: solo viajan los 5 primeros caracteres del SHA-1.
 * Si el servicio no responde, no bloquea el registro (falla abierta) y queda en el log.
 */
export function verificadorHibp(log: Logger, habilitado: boolean): VerificadorClavesFiltradas {
  return {
    async estaFiltrada(clave) {
      if (!habilitado) return false
      const sha1 = createHash('sha1').update(clave).digest('hex').toUpperCase()
      const prefijo = sha1.slice(0, 5)
      const sufijo = sha1.slice(5)
      try {
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefijo}`, {
          headers: { 'Add-Padding': 'true', 'User-Agent': 'la-rejana-callejera' },
          signal: AbortSignal.timeout(2500),
        })
        if (!res.ok) throw new Error(`HIBP respondió ${res.status}`)
        const cuerpo = await res.text()
        return cuerpo.split('\n').some((linea) => {
          const [suf, veces] = linea.trim().split(':')
          return suf === sufijo && Number(veces) > 0
        })
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'No se pudo consultar HIBP; se omite la verificación')
        return false
      }
    },
  }
}

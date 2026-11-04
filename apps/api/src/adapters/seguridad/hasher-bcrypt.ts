import { createHmac } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { HasherClaves } from '../../ports/servicios'

const VERSION = 'v2$'

/**
 * bcrypt con costo 12 (mínimo exigido). bcryptjs es JS puro: sin binarios nativos en el despliegue.
 *
 * bcrypt ignora todo lo que pasa de 72 bytes; con tildes o frases largas eso es fácil de alcanzar.
 * Por eso la clave se pre-procesa con HMAC-SHA256 (con la pimienta del servidor, lo que además evita
 * el "password shucking") y se guarda con el prefijo `v2$`. Los hashes antiguos (sin prefijo) se
 * siguen aceptando y se actualizan en el siguiente inicio de sesión.
 */
export function hasherBcrypt(costo: number, pimienta: string): HasherClaves & { necesitaActualizar(hash: string): boolean } {
  if (costo < 12 && process.env.NODE_ENV === 'production') throw new Error('El costo de bcrypt debe ser ≥ 12')
  const previo = (clave: string) => createHmac('sha256', pimienta).update(clave.normalize('NFKC')).digest('base64')
  return {
    hash: async (clave) => `${VERSION}${await bcrypt.hash(previo(clave), costo)}`,
    verificar: (clave, hash) => (hash.startsWith(VERSION) ? bcrypt.compare(previo(clave), hash.slice(VERSION.length)) : bcrypt.compare(clave, hash)),
    necesitaActualizar: (hash) => !hash.startsWith(VERSION) || bcrypt.getRounds(hash.slice(VERSION.length)) < costo,
  }
}

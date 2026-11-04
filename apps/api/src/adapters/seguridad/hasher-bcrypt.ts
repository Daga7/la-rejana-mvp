import bcrypt from 'bcryptjs'
import type { HasherClaves } from '../../ports/servicios'

/** bcrypt con costo 12 (mínimo exigido). bcryptjs es JS puro: sin binarios nativos que compilar en el despliegue. */
export function hasherBcrypt(costo = 12): HasherClaves {
  if (costo < 12 && process.env.NODE_ENV === 'production') throw new Error('El costo de bcrypt debe ser ≥ 12')
  return {
    hash: (clave) => bcrypt.hash(clave, costo),
    verificar: (clave, hash) => bcrypt.compare(clave, hash),
  }
}

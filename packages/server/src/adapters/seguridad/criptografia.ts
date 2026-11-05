import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import type { Criptografia } from '../../ports/servicios'

export function criptografiaNode(pimienta: string): Criptografia {
  return {
    tokenAleatorio(bytes = 32) {
      return randomBytes(bytes).toString('base64url')
    },
    codigoNumerico(digitos) {
      // randomInt es uniforme (sin sesgo de módulo).
      return String(randomInt(0, 10 ** digitos)).padStart(digitos, '0')
    },
    codigoAlfabeto(alfabeto, largo) {
      // Un símbolo uniforme por posición (randomInt no tiene sesgo de módulo).
      return Array.from({ length: largo }, () => alfabeto[randomInt(0, alfabeto.length)]).join('')
    },
    huella(valor) {
      return createHmac('sha256', pimienta).update(valor).digest('base64url')
    },
    compararSeguro(a, b) {
      const ba = Buffer.from(a)
      const bb = Buffer.from(b)
      return ba.length === bb.length && timingSafeEqual(ba, bb)
    },
  }
}

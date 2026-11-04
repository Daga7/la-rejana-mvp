// Reglas de negocio compartidas entre la API (que las hace cumplir) y la web (que las muestra).

/** La propina sugerida es el 10 % del consumo (antes de la propina). Es voluntaria: 0 o este valor. */
export const PORCENTAJE_PROPINA = 10

/**
 * Propina del 10 % redondeada a la centena más cercana; en la mitad exacta sube.
 * Ejemplos: $101.000 → $10.100 · $45.940 → $4.600 · $45.440 → $4.500 · $45.500 (mitad exacta) → $4.600.
 */
export function propinaSugerida(consumo: number): number {
  if (!Number.isFinite(consumo) || consumo <= 0) return 0
  const decima = (Math.round(consumo) * PORCENTAJE_PROPINA) / 100 // pesos, puede tener decimales
  return Math.floor(decima / 100 + 0.5) * 100
}

// --- Pasaporte de sellos -------------------------------------------------------------------

/** Letras y números sin los que se confunden (0/O, 1/I/L): 31 símbolos; 8 caracteres ≈ 39,6 bits. */
export const ALFABETO_PASAPORTE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const LARGO_CODIGO_PASAPORTE = 8

/** «abcd efgh», «ABCD-EFGH» → «ABCDEFGH». */
export function normalizarCodigoPasaporte(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** «ABCDEFGH» → «ABCD-EFGH» (más fácil de dictar y de leer en la caja). */
export function codigoPasaporteLegible(codigo: string): string {
  return codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo
}

/** Versión de las condiciones del Pasaporte que acepta el cliente (Ley 1581: queda registrada). */
export const VERSION_TERMINOS_PASAPORTE = '2026-11'


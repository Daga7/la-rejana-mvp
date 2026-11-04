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

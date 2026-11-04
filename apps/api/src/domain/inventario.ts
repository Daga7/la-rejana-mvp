// Reglas de inventario por receta. Todo es puro: recibe datos, devuelve resultados.

export interface LineaReceta {
  insumoId: string
  cantidad: number
}

export interface ItemSolicitado {
  productoId: string
  cantidad: number
}

const EPS = 1e-9

/** Redondeo a 3 decimales (la precisión de la columna numeric(14,3)). */
export function r3(valor: number): number {
  return Math.round(valor * 1000) / 1000
}

/** Insumos totales que consume un pedido según las recetas de sus productos. */
export function consumoPorReceta(items: ItemSolicitado[], recetas: ReadonlyMap<string, LineaReceta[]>): Map<string, number> {
  const consumo = new Map<string, number>()
  for (const item of items) {
    for (const linea of recetas.get(item.productoId) ?? []) {
      consumo.set(linea.insumoId, r3((consumo.get(linea.insumoId) ?? 0) + linea.cantidad * item.cantidad))
    }
  }
  return consumo
}

/**
 * Cuántas unidades de un producto alcanzan con el stock actual: el insumo más escaso manda.
 * Ej.: 32 panes y carne para 50 → 32 hamburguesas. Devuelve null si el producto no tiene receta.
 */
export function unidadesPreparables(receta: LineaReceta[], stock: ReadonlyMap<string, number>): number | null {
  if (receta.length === 0) return null
  let minimo = Number.POSITIVE_INFINITY
  for (const linea of receta) {
    const disponible = stock.get(linea.insumoId) ?? 0
    minimo = Math.min(minimo, Math.floor((disponible + EPS) / linea.cantidad))
  }
  return Math.max(0, minimo)
}

export interface Faltante {
  insumoId: string
  requerido: number
  disponible: number
}

/** Insumos que no alcanzan para cubrir un consumo. */
export function faltantes(consumo: ReadonlyMap<string, number>, stock: ReadonlyMap<string, number>): Faltante[] {
  const out: Faltante[] = []
  for (const [insumoId, requerido] of consumo) {
    const disponible = stock.get(insumoId) ?? 0
    if (requerido > disponible + EPS) out.push({ insumoId, requerido, disponible })
  }
  return out
}

/** Productos del pedido afectados por los faltantes (para un mensaje claro al cliente). */
export function productosAfectados(
  items: ItemSolicitado[],
  recetas: ReadonlyMap<string, LineaReceta[]>,
  insumosFaltantes: ReadonlySet<string>,
): string[] {
  return items.filter((i) => (recetas.get(i.productoId) ?? []).some((l) => insumosFaltantes.has(l.insumoId))).map((i) => i.productoId)
}

/** Alerta de stock bajo: solo si el insumo tiene un mínimo configurado. */
export function stockBajo(cantidad: number, minimo: number): boolean {
  return minimo > 0 && cantidad <= minimo + EPS
}

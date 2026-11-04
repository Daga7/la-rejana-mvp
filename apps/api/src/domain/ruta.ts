// Optimizador de rutas de domicilio.
//
// Entrada: matriz de minutos entre puntos, donde el índice 0 es la sede (salida) y 1..n son las entregas.
// Objetivo: ordenar las entregas para minimizar el tiempo total de la salida (hasta la última entrega),
// sin que ninguna entrega supere el límite de minutos desde que sale el pedido (comida caliente).
//
// Como el tiempo de llegada crece a lo largo de la ruta, "ninguna entrega supera el límite" equivale a
// "la última entrega llega antes del límite". Con máximo 10 entregas por salida, se resuelve de forma
// exacta con programación dinámica (Held-Karp, O(n²·2ⁿ)), y si no cabe en una salida se busca la
// partición en el menor número de salidas factibles (DP sobre subconjuntos, O(3ⁿ)).

export interface OpcionesRuta {
  /** Máximo de minutos desde que sale el pedido hasta que se entrega. */
  limiteMinutos: number
  /** Minutos que se demora el domiciliario entregando en cada parada. */
  minutosPorParada: number
}

export interface SalidaPlaneada {
  /** Índices de las entregas (1..n) en el orden de visita. */
  orden: number[]
  /** Minuto de llegada a cada entrega, en el mismo orden. */
  llegadas: number[]
  minutosTotales: number
  cumpleLimite: boolean
}

export interface PlanRuta {
  salidas: SalidaPlaneada[]
  /** true si fue necesario dividir en varias salidas. */
  dividir: boolean
  /** Entregas que ni solas cumplen el límite (quedan en salidas propias marcadas). */
  inalcanzables: number[]
}

export const MAX_ENTREGAS_POR_PLAN = 10

export function planificarRuta(matriz: number[][], opciones: OpcionesRuta): PlanRuta {
  const n = matriz.length - 1
  if (n <= 0) return { salidas: [], dividir: false, inalcanzables: [] }
  if (n > MAX_ENTREGAS_POR_PLAN) throw new Error(`Máximo ${MAX_ENTREGAS_POR_PLAN} entregas por plan`)

  const T = (a: number, b: number) => matriz[a]![b]!
  const servicio = opciones.minutosPorParada
  const total = 1 << n
  const INF = Number.POSITIVE_INFINITY

  // dp[mask][j] = minuto de llegada a la entrega j (0-based) habiendo visitado exactamente `mask`, terminando en j.
  const dp: Float64Array[] = Array.from({ length: total }, () => new Float64Array(n).fill(INF))
  const padre: Int8Array[] = Array.from({ length: total }, () => new Int8Array(n).fill(-1))
  for (let j = 0; j < n; j++) dp[1 << j]![j] = T(0, j + 1)

  for (let mask = 1; mask < total; mask++) {
    const fila = dp[mask]!
    for (let j = 0; j < n; j++) {
      const actual = fila[j]!
      if (actual === INF || !(mask & (1 << j))) continue
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue
        const sig = mask | (1 << k)
        const llegada = actual + servicio + T(j + 1, k + 1)
        if (llegada < dp[sig]![k]!) {
          dp[sig]![k] = llegada
          padre[sig]![k] = j
        }
      }
    }
  }

  // Mejor terminación (mínimo tiempo total) para cada subconjunto.
  const mejorFin = new Int8Array(total).fill(-1)
  const mejorTiempo = new Float64Array(total).fill(INF)
  for (let mask = 1; mask < total; mask++) {
    for (let j = 0; j < n; j++) {
      const v = dp[mask]![j]!
      if (v < mejorTiempo[mask]!) {
        mejorTiempo[mask] = v
        mejorFin[mask] = j
      }
    }
  }

  const reconstruir = (mask: number): SalidaPlaneada => {
    const orden: number[] = []
    let m = mask
    let j = mejorFin[mask]!
    while (j !== -1) {
      orden.push(j)
      const p = padre[m]![j]!
      m &= ~(1 << j)
      j = p
    }
    orden.reverse()
    // Recalcula llegadas en orden de visita.
    const llegadas: number[] = []
    let t = 0
    let prev = 0
    for (const idx of orden) {
      t += (llegadas.length ? servicio : 0) + T(prev, idx + 1)
      llegadas.push(redondear(t))
      prev = idx + 1
    }
    const minutosTotales = llegadas[llegadas.length - 1] ?? 0
    return { orden: orden.map((i) => i + 1), llegadas, minutosTotales, cumpleLimite: minutosTotales <= opciones.limiteMinutos + 1e-9 }
  }

  const todos = total - 1
  if (mejorTiempo[todos]! <= opciones.limiteMinutos + 1e-9) {
    return { salidas: [reconstruir(todos)], dividir: false, inalcanzables: [] }
  }

  // Entregas que no cumplen ni yendo directo: van solas y marcadas.
  const inalcanzables: number[] = []
  let alcanzables = 0
  for (let j = 0; j < n; j++) {
    if (mejorTiempo[1 << j]! > opciones.limiteMinutos + 1e-9) inalcanzables.push(j + 1)
    else alcanzables |= 1 << j
  }

  // Partición mínima en salidas factibles: f[mask] = (salidas, minutos totales).
  const factible = (mask: number) => mejorTiempo[mask]! <= opciones.limiteMinutos + 1e-9
  const salidasMin = new Int16Array(total).fill(32767)
  const minutosMin = new Float64Array(total).fill(INF)
  const eleccion = new Int32Array(total).fill(0)
  salidasMin[0] = 0
  minutosMin[0] = 0
  for (let mask = 1; mask < total; mask++) {
    if ((mask & alcanzables) !== mask) continue
    const bajo = mask & -mask // la entrega de menor índice debe ir en algún grupo
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if (!(sub & bajo) || !factible(sub)) continue
      const resto = mask & ~sub
      const s = salidasMin[resto]! + 1
      const mins = minutosMin[resto]! + mejorTiempo[sub]!
      if (s < salidasMin[mask]! || (s === salidasMin[mask]! && mins < minutosMin[mask]! - 1e-9)) {
        salidasMin[mask] = s
        minutosMin[mask] = mins
        eleccion[mask] = sub
      }
    }
  }

  const salidas: SalidaPlaneada[] = []
  let restante = alcanzables
  while (restante) {
    const sub = eleccion[restante]!
    salidas.push(reconstruir(sub))
    restante &= ~sub
  }
  salidas.sort((a, b) => a.minutosTotales - b.minutosTotales)
  for (const idx of inalcanzables) salidas.push(reconstruir(1 << (idx - 1)))

  return { salidas, dividir: salidas.length > 1, inalcanzables }
}

function redondear(v: number): number {
  return Math.round(v * 10) / 10
}

'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface LineaBorrador {
  productoId: string
  nombre: string
  precio: number
  cantidad: number
  notas: string
}

interface Borrador {
  lineas: LineaBorrador[]
  /** Clave de idempotencia de este envío: si la señal falla y se reintenta, la cocina no recibe la ronda dos veces. */
  clave: string
}

interface EstadoBorradores {
  porCuenta: Record<string, Borrador>
  agregar: (cuentaId: string, linea: Omit<LineaBorrador, 'cantidad' | 'notas'>) => void
  cambiar: (cuentaId: string, indice: number, cambios: Partial<Pick<LineaBorrador, 'cantidad' | 'notas'>>) => void
  quitar: (cuentaId: string, indice: number) => void
  limpiar: (cuentaId: string) => void
}

const nueva = (): Borrador => ({ lineas: [], clave: crypto.randomUUID() })

// Al cambiar el borrador se genera una clave nueva: es otra ronda distinta.
const conLineas = (b: Borrador | undefined, lineas: LineaBorrador[]): Borrador => ({ lineas, clave: b && lineas.length ? crypto.randomUUID() : (b?.clave ?? crypto.randomUUID()) })

/** Lo que el mesero va anotando por mesa antes de enviarlo a la cocina (se conserva si recarga la página). */
export const useBorradores = create<EstadoBorradores>()(
  persist(
    (set) => ({
      porCuenta: {},
      agregar: (cuentaId, l) =>
        set((s) => {
          const b = s.porCuenta[cuentaId] ?? nueva()
          // Mismo producto sin nota: se suma a la línea existente.
          const i = b.lineas.findIndex((x) => x.productoId === l.productoId && !x.notas)
          const lineas = i >= 0 ? b.lineas.map((x, k) => (k === i ? { ...x, cantidad: Math.min(20, x.cantidad + 1) } : x)) : [...b.lineas, { ...l, cantidad: 1, notas: '' }]
          return { porCuenta: { ...s.porCuenta, [cuentaId]: conLineas(b, lineas) } }
        }),
      cambiar: (cuentaId, indice, cambios) =>
        set((s) => {
          const b = s.porCuenta[cuentaId]
          if (!b) return s
          const lineas = b.lineas.map((x, k) => (k === indice ? { ...x, ...cambios } : x))
          return { porCuenta: { ...s.porCuenta, [cuentaId]: conLineas(b, lineas) } }
        }),
      quitar: (cuentaId, indice) =>
        set((s) => {
          const b = s.porCuenta[cuentaId]
          if (!b) return s
          return { porCuenta: { ...s.porCuenta, [cuentaId]: conLineas(b, b.lineas.filter((_, k) => k !== indice)) } }
        }),
      limpiar: (cuentaId) =>
        set((s) => {
          const resto = { ...s.porCuenta }
          delete resto[cuentaId]
          return { porCuenta: resto }
        }),
    }),
    { name: 'rejana-mesero-borradores', version: 1, storage: createJSONStorage(() => sessionStorage) },
  ),
)

/** Agrupa líneas iguales (mismo producto y misma nota) como lo exige la API. */
export function itemsParaEnviar(lineas: LineaBorrador[]) {
  const mapa = new Map<string, { productoId: string; cantidad: number; notas?: string }>()
  for (const l of lineas) {
    const notas = l.notas.trim()
    const k = `${l.productoId}|${notas}`
    const previo = mapa.get(k)
    mapa.set(k, { productoId: l.productoId, cantidad: Math.min(20, (previo?.cantidad ?? 0) + l.cantidad), ...(notas ? { notas } : {}) })
  }
  return [...mapa.values()]
}

'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface ItemCarrito {
  productoId: string
  nombre: string
  precio: number
  cantidad: number
  notas: string
  imagenUrl: string | null
}

interface EstadoCarrito {
  sedeId: string | null
  items: ItemCarrito[]
  /** Clave de idempotencia del checkout en curso (permite reintentar sin duplicar el pedido). */
  claveCheckout: string | null
  elegirSede: (sedeId: string) => void
  agregar: (item: Omit<ItemCarrito, 'cantidad' | 'notas'>, cantidad: number, notas?: string) => void
  cambiarCantidad: (productoId: string, notas: string, cantidad: number) => void
  quitar: (productoId: string, notas: string) => void
  vaciar: () => void
  nuevaClaveCheckout: () => string
}

const MAX_POR_LINEA = 20
const igual = (i: ItemCarrito, productoId: string, notas: string) => i.productoId === productoId && i.notas === notas

/** Carrito guardado en el dispositivo: sobrevive a recargas y a cortes de conexión. */
export const useCarrito = create<EstadoCarrito>()(
  persist(
    (set, get) => ({
      sedeId: null,
      items: [],
      claveCheckout: null,
      elegirSede: (sedeId) => {
        if (get().sedeId === sedeId) return
        // Cada sede tiene su menú y sus precios: cambiar de sede vacía el carrito.
        set({ sedeId, items: [], claveCheckout: null })
      },
      agregar: (item, cantidad, notas = '') => {
        const n = notas.trim().slice(0, 140)
        const items = [...get().items]
        const i = items.findIndex((x) => igual(x, item.productoId, n))
        if (i >= 0) items[i] = { ...items[i]!, cantidad: Math.min(MAX_POR_LINEA, items[i]!.cantidad + cantidad), precio: item.precio }
        else items.push({ ...item, cantidad: Math.min(MAX_POR_LINEA, cantidad), notas: n })
        set({ items, claveCheckout: null })
      },
      cambiarCantidad: (productoId, notas, cantidad) =>
        set({
          items: cantidad <= 0 ? get().items.filter((x) => !igual(x, productoId, notas)) : get().items.map((x) => (igual(x, productoId, notas) ? { ...x, cantidad: Math.min(MAX_POR_LINEA, cantidad) } : x)),
          claveCheckout: null,
        }),
      quitar: (productoId, notas) => set({ items: get().items.filter((x) => !igual(x, productoId, notas)), claveCheckout: null }),
      vaciar: () => set({ items: [], claveCheckout: null }),
      nuevaClaveCheckout: () => {
        const actual = get().claveCheckout
        if (actual) return actual
        const clave = crypto.randomUUID()
        set({ claveCheckout: clave })
        return clave
      },
    }),
    { name: 'rejana-carrito', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)

export const totalItems = (items: ItemCarrito[]) => items.reduce((s, i) => s + i.cantidad, 0)
export const subtotal = (items: ItemCarrito[]) => items.reduce((s, i) => s + i.precio * i.cantidad, 0)

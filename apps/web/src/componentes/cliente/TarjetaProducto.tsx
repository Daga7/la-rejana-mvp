'use client'

import { cop, type ProductoMenuDTO } from '@rejana/shared'
import { Plus } from 'lucide-react'
import { memo } from 'react'

/** Memorizada: los renders del menú (sesión, carrito, revalidaciones) no vuelven a pintar cada tarjeta. */
export const TarjetaProducto = memo(function TarjetaProducto({ producto, onElegir, prioridad }: { producto: ProductoMenuDTO; onElegir: (p: ProductoMenuDTO) => void; prioridad?: boolean }) {
  const pocas = !producto.agotado && producto.maxUnidades !== null && producto.maxUnidades <= 5
  return (
    <button
      onClick={() => onElegir(producto)}
      disabled={producto.agotado}
      className="sticker group flex w-full items-stretch gap-3 overflow-hidden p-0 text-left text-tinta transition hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60 disabled:hover:translate-y-0 disabled:active:scale-100"
    >
      <div className="relative w-28 shrink-0 border-r-2 border-tinta sm:w-36">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={producto.imagenUrl ?? '/iconos/icono.svg'}
          alt=""
          width={144}
          height={108}
          loading={prioridad ? 'eager' : 'lazy'}
          fetchPriority={prioridad ? 'high' : 'auto'}
          className={`h-full w-full object-cover ${producto.agotado ? 'grayscale' : ''}`}
        />
        {producto.agotado && <span className="chip absolute left-2 top-2 border-2 border-tinta bg-rojo-500 text-white">Agotado</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col py-3 pr-3">
        <span className="font-extrabold leading-tight">{producto.nombre}</span>
        <span className="mt-1 line-clamp-2 text-xs text-tinta-soft">{producto.descripcion}</span>
        <span className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="text-lg font-black text-rosa-600">{producto.agotado ? 'Por hoy no' : cop(producto.precio)}</span>
          {!producto.agotado && (
            <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-tinta bg-amarillo shadow-sticker-sm transition group-hover:bg-rosa group-hover:text-white" aria-hidden>
              <Plus size={18} strokeWidth={3} />
            </span>
          )}
        </span>
        {pocas && <span className="mt-1 text-[11px] font-bold text-naranja-700">¡Quedan {producto.maxUnidades}!</span>}
      </div>
    </button>
  )
})

export function EsqueletoProducto() {
  return (
    <div className="flex h-32 gap-3 overflow-hidden rounded-[1.1rem] border-2 border-noche-700 p-0">
      <div className="esqueleto h-full w-28 rounded-none sm:w-36" />
      <div className="flex flex-1 flex-col gap-2 py-3 pr-3">
        <div className="esqueleto h-4 w-2/3" />
        <div className="esqueleto h-3 w-full" />
        <div className="esqueleto h-3 w-4/5" />
        <div className="esqueleto mt-auto h-6 w-1/3" />
      </div>
    </div>
  )
}

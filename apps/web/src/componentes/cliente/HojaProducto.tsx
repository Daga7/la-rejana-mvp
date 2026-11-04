'use client'

import { cop, type ProductoMenuDTO } from '@rejana/shared'
import { Minus, Plus, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Hoja } from '@/componentes/Hoja'

export function HojaProducto({ producto, onCerrar, onAgregar }: { producto: ProductoMenuDTO | null; onCerrar: () => void; onAgregar: (cantidad: number, notas: string) => void }) {
  return (
    <Hoja abierta={!!producto} onCerrar={onCerrar} titulo={producto?.nombre ?? ''}>
      {producto && <Contenido key={producto.id} producto={producto} onAgregar={onAgregar} />}
    </Hoja>
  )
}

function Contenido({ producto, onAgregar }: { producto: ProductoMenuDTO; onAgregar: (cantidad: number, notas: string) => void }) {
  const [cantidad, setCantidad] = useState(1)
  const [notas, setNotas] = useState('')
  const maximo = Math.min(20, producto.maxUnidades ?? 20)
  return (
    <div className="grid gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={producto.imagenUrl ?? '/iconos/icono.svg'} alt={producto.nombre} width={400} height={300} className="aspect-[4/3] w-full rounded-2xl border-2 border-tinta object-cover" />
      <p className="text-sm text-tinta-soft">{producto.descripcion}</p>
      <label className="block">
        <span className="etiqueta">¿Algún cambio? (opcional)</span>
        <input className="campo" maxLength={140} placeholder="Ej.: sin cebolla, término tres cuartos" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2" role="group" aria-label="Cantidad">
          <button className="btn btn-blanco !h-11 !w-11 !p-0" onClick={() => setCantidad((c) => Math.max(1, c - 1))} disabled={cantidad <= 1} aria-label="Quitar uno">
            <Minus size={18} />
          </button>
          <output className="w-8 text-center text-xl font-black tabular-nums" aria-live="polite">
            {cantidad}
          </output>
          <button className="btn btn-blanco !h-11 !w-11 !p-0" onClick={() => setCantidad((c) => Math.min(maximo, c + 1))} disabled={cantidad >= maximo} aria-label="Agregar uno">
            <Plus size={18} />
          </button>
        </div>
        <button className="btn btn-rosa btn-lg flex-1" onClick={() => onAgregar(cantidad, notas)}>
          <ShoppingBag size={18} aria-hidden /> Agregar · {cop(producto.precio * cantidad)}
        </button>
      </div>
      {producto.maxUnidades !== null && producto.maxUnidades <= 20 && <p className="text-xs text-tinta-soft">Con lo que hay en cocina alcanzan {producto.maxUnidades} unidades.</p>}
    </div>
  )
}

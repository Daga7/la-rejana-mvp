'use client'

import { cop, type MenuDTO, type SedePublicaDTO } from '@rejana/shared'
import { ArrowRight, Minus, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { obtener } from '@/lib/api'
import { subtotal, useCarrito } from '@/lib/carrito'
import { useHidratado } from './MarcoCliente'

export function Carrito() {
  const hidratado = useHidratado()
  const { sedeId, items, cambiarCantidad, quitar } = useCarrito()
  const { data: sedes } = useSWR<{ sedes: SedePublicaDTO[] }>('/sedes', obtener)
  const sede = sedes?.sedes.find((s) => s.id === sedeId)
  const { data: menu } = useSWR<MenuDTO>(sedeId ? `/sedes/${sedeId}/menu` : null, obtener)

  // Sincroniza el carrito con el menú vigente: precios nuevos y productos que se agotaron.
  const productos = useMemo(() => new Map((menu?.categorias ?? []).flatMap((c) => c.productos).map((p) => [p.id, p])), [menu])
  useEffect(() => {
    if (!menu) return
    const estado = useCarrito.getState()
    let cambio = false
    const nuevos = estado.items.map((i) => {
      const p = productos.get(i.productoId)
      if (p && p.precio !== i.precio) {
        cambio = true
        return { ...i, precio: p.precio }
      }
      return i
    })
    if (cambio) {
      useCarrito.setState({ items: nuevos, claveCheckout: null })
      avisar('Actualizamos algunos precios de tu carrito', 'info')
    }
  }, [menu, productos])

  if (!hidratado) return <div className="esqueleto mx-auto mt-8 h-64 max-w-2xl" />

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-14 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/sticker-chef-fijo.webp" alt="" width={160} height={160} />
        <h1 className="titulo text-3xl">Tu carrito está vacío</h1>
        <p className="text-noche-300">Antójate de algo del menú y aquí lo verás.</p>
        <Link href="/menu" className="btn btn-amarillo btn-lg">
          Ver el menú
        </Link>
      </div>
    )
  }

  const sub = subtotal(items)
  const envio = sede?.tarifaDomicilio ?? 0
  const agotados = items.filter((i) => {
    const p = productos.get(i.productoId)
    return menu && (!p || p.agotado || (p.maxUnidades !== null && p.maxUnidades < i.cantidad))
  })

  return (
    <div className="mx-auto max-w-2xl pt-6">
      <p className="acento text-lg">{sede ? `Sede ${sede.nombre}` : 'Tu pedido'}</p>
      <h1 className="titulo text-3xl">Tu carrito</h1>
      <ul className="mt-5 grid gap-3">
        <AnimatePresence initial={false}>
          {items.map((i) => {
            const p = productos.get(i.productoId)
            const problema = menu && (!p || p.agotado) ? 'Se agotó' : p && p.maxUnidades !== null && p.maxUnidades < i.cantidad ? `Solo quedan ${p.maxUnidades}` : null
            return (
              <motion.li key={`${i.productoId}|${i.notas}`} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }} className="sticker flex gap-3 p-3 text-tinta">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.imagenUrl ?? '/iconos/icono.svg'} alt="" width={80} height={60} className="h-16 w-20 shrink-0 rounded-xl border-2 border-tinta object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-extrabold leading-tight">{i.nombre}</p>
                    <button onClick={() => quitar(i.productoId, i.notas)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-tinta-soft hover:bg-black/5" aria-label={`Quitar ${i.nombre}`}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                  {i.notas && <p className="text-xs text-tinta-soft">«{i.notas}»</p>}
                  {problema && <p className="text-xs font-bold text-rojo-600">{problema}</p>}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5" role="group" aria-label={`Cantidad de ${i.nombre}`}>
                      <button className="btn btn-blanco !h-9 !min-h-0 !w-9 !p-0" onClick={() => cambiarCantidad(i.productoId, i.notas, i.cantidad - 1)} aria-label="Quitar uno">
                        <Minus size={16} />
                      </button>
                      <span className="w-7 text-center font-black tabular-nums">{i.cantidad}</span>
                      <button className="btn btn-blanco !h-9 !min-h-0 !w-9 !p-0" onClick={() => cambiarCantidad(i.productoId, i.notas, i.cantidad + 1)} aria-label="Agregar uno" disabled={i.cantidad >= 20}>
                        <Plus size={16} />
                      </button>
                    </div>
                    <span className="font-black tabular-nums text-rosa-600">{cop(i.precio * i.cantidad)}</span>
                  </div>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <div className="sticker mt-5 grid gap-2 p-5 text-tinta">
        <Fila nombre="Subtotal" valor={cop(sub)} />
        <Fila nombre="Domicilio" valor={sede ? cop(envio) : '…'} />
        <div className="my-1 h-0.5 bg-tinta/10" />
        <Fila nombre="Total" valor={cop(sub + envio)} fuerte />
        {agotados.length > 0 && <p className="text-sm font-bold text-rojo-600">Ajusta los productos marcados antes de continuar.</p>}
        <Link href="/checkout" aria-disabled={agotados.length > 0} className={`btn btn-rosa btn-lg mt-2 w-full ${agotados.length > 0 ? 'pointer-events-none opacity-50' : ''}`}>
          Continuar <ArrowRight size={18} aria-hidden />
        </Link>
        <Link href="/menu" className="btn btn-fantasma btn-sm text-tinta">
          Seguir agregando
        </Link>
      </div>
    </div>
  )
}

function Fila({ nombre, valor, fuerte }: { nombre: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${fuerte ? 'text-lg font-black' : 'text-sm'}`}>
      <span>{nombre}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  )
}

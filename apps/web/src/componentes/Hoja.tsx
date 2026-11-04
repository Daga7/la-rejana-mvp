'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { usePresencia } from '@/lib/presencia'

/** Hoja modal: sube desde abajo en el celular y aparece centrada en pantallas grandes. */
export function Hoja({ abierta, onCerrar, titulo, children, ancho = 'max-w-lg' }: { abierta: boolean; onCerrar: () => void; titulo: string; children: ReactNode; ancho?: string }) {
  const panel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const { montado, saliendo } = usePresencia(abierta)
  // Mientras sale, la hoja sigue mostrando su último contenido aunque el padre ya lo haya limpiado
  // (p. ej. el producto elegido vuelve a null al cerrar).
  const ultimo = useRef({ titulo, children })
  // eslint-disable-next-line react-hooks/refs -- instantánea derivada de las props, idempotente
  if (abierta) ultimo.current = { titulo, children }

  useEffect(() => {
    if (!abierta) return
    const anterior = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus(), 60)
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
      if (e.key === 'Tab' && panel.current) {
        // Mantiene el foco dentro de la hoja.
        const focos = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea')]
        if (focos.length === 0) return
        const primero = focos[0]!
        const ultimo = focos[focos.length - 1]!
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault()
          ultimo.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault()
          primero.focus()
        }
      }
    }
    window.addEventListener('keydown', tecla)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
      anterior?.focus?.()
    }
  }, [abierta, onCerrar])

  if (!montado) return null
  // eslint-disable-next-line react-hooks/refs -- ver la instantánea de arriba
  const mostrado = abierta ? { titulo, children } : ultimo.current
  return (
    <div className={`fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4 ${saliendo ? 'pointer-events-none' : ''}`}>
      <div className={`absolute inset-0 bg-noche-950/70 backdrop-blur-sm ${saliendo ? 'anim-fundido-salir' : 'anim-fundido-entrar'}`} onClick={onCerrar} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={`relative max-h-[92dvh] w-full ${ancho} overflow-y-auto rounded-t-3xl border-2 border-tinta bg-crema pb-seguro text-tinta shadow-sticker-lg sm:rounded-3xl ${saliendo ? 'anim-hoja-salir' : 'anim-hoja-entrar'}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-2 border-tinta/10 bg-crema/95 px-5 py-3 backdrop-blur">
          <h2 id={idTitulo} className="text-lg font-black leading-tight">
            {mostrado.titulo}
          </h2>
          <button onClick={onCerrar} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-5 pt-4">{mostrado.children}</div>
      </div>
    </div>
  )
}

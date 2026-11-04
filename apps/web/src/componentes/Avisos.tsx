'use client'

import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { create } from 'zustand'

type TipoAviso = 'ok' | 'error' | 'info'
interface Aviso {
  id: number
  texto: string
  tipo: TipoAviso
  accion?: { texto: string; fn: () => void }
}

interface EstadoAvisos {
  avisos: Aviso[]
  agregar: (a: Omit<Aviso, 'id'>, duracionMs?: number) => void
  quitar: (id: number) => void
}

let siguiente = 1
export const useAvisos = create<EstadoAvisos>((set, get) => ({
  avisos: [],
  agregar: (a, duracionMs = 3500) => {
    const id = siguiente++
    set({ avisos: [...get().avisos.slice(-2), { ...a, id }] })
    if (duracionMs > 0) setTimeout(() => get().quitar(id), duracionMs)
  },
  quitar: (id) => set({ avisos: get().avisos.filter((x) => x.id !== id) }),
}))

/** Muestra un aviso breve. Se puede llamar desde cualquier parte del cliente. */
export function avisar(texto: string, tipo: TipoAviso = 'ok', accion?: Aviso['accion'], duracionMs?: number) {
  useAvisos.getState().agregar({ texto, tipo, accion }, duracionMs ?? (accion ? 10_000 : 3500))
}

const ICONO = { ok: CheckCircle2, error: XCircle, info: Info }
const COLOR = { ok: 'bg-turquesa text-tinta', error: 'bg-rojo text-white', info: 'bg-amarillo text-tinta' }

export function Avisos() {
  const { avisos, quitar } = useAvisos()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {avisos.map((a) => {
          const Icono = ICONO[a.tipo]
          return (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border-2 border-tinta px-4 py-3 text-sm font-bold shadow-sticker ${COLOR[a.tipo]}`}
            >
              <Icono size={18} aria-hidden className="shrink-0" />
              <span className="flex-1">{a.texto}</span>
              {a.accion && (
                <button
                  className="rounded-full border-2 border-tinta bg-white px-3 py-1 text-xs text-tinta"
                  onClick={() => {
                    a.accion!.fn()
                    quitar(a.id)
                  }}
                >
                  {a.accion.texto}
                </button>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

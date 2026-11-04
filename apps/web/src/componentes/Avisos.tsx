'use client'

import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { create } from 'zustand'

type TipoAviso = 'ok' | 'error' | 'info'
interface Aviso {
  id: number
  texto: string
  tipo: TipoAviso
  accion?: { texto: string; fn: () => void }
  /** Corre la animación de salida antes de quitarlo. */
  saliendo?: boolean
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
  quitar: (id) => {
    if (!get().avisos.some((x) => x.id === id && !x.saliendo)) return
    set({ avisos: get().avisos.map((x) => (x.id === id ? { ...x, saliendo: true } : x)) })
    setTimeout(() => set({ avisos: get().avisos.filter((x) => x.id !== id) }), 200)
  },
}))

/** Muestra un aviso breve. Se puede llamar desde cualquier parte del cliente. */
export function avisar(texto: string, tipo: TipoAviso = 'ok', accion?: Aviso['accion'], duracionMs?: number) {
  useAvisos.getState().agregar({ texto, tipo, accion }, duracionMs ?? (accion ? 10_000 : 3500))
}

const ICONO = { ok: CheckCircle2, error: XCircle, info: Info }
const COLOR = { ok: 'bg-turquesa text-tinta', error: 'bg-rojo-500 text-white', info: 'bg-amarillo text-tinta' }

export function Avisos() {
  const { avisos, quitar } = useAvisos()
  return (
    // En el celular queda por encima de la barra inferior y de la barra flotante del carrito.
    <div className="pointer-events-none fixed inset-x-0 bottom-40 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
      {avisos.map((a) => {
          const Icono = ICONO[a.tipo]
          return (
            <div
              key={a.id}
              className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border-2 border-tinta px-4 py-3 text-sm font-bold shadow-sticker ${COLOR[a.tipo]} ${a.saliendo ? 'anim-aviso-salir' : 'anim-aviso-entrar'}`}
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
            </div>
          )
        })}
    </div>
  )
}

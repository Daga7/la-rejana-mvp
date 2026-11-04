'use client'

import { AnimatePresence, motion } from 'motion/react'
import { WifiOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'

function suscribir(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useEnLinea(): boolean {
  return useSyncExternalStore(suscribir, () => navigator.onLine, () => true)
}

/** Franja visible cuando el dispositivo pierde la conexión (la app sigue mostrando lo que tiene en caché). */
export function EstadoConexion() {
  const enLinea = useEnLinea()
  return (
    <AnimatePresence>
      {!enLinea && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[95] flex items-center justify-center gap-2 border-b-2 border-tinta bg-amarillo px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-bold text-tinta"
          role="alert"
        >
          <WifiOff size={16} aria-hidden /> Sin conexión: te mostramos lo último que cargamos. Tu carrito queda guardado.
        </motion.div>
      )}
    </AnimatePresence>
  )
}

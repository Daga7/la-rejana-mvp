'use client'

import { WifiOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { usePresencia } from '@/lib/presencia'

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
  const { montado, saliendo } = usePresencia(!enLinea)
  if (!montado) return null
  return (
    <div
      className={`fixed inset-x-0 top-0 z-[95] flex items-center justify-center gap-2 border-b-2 border-tinta bg-amarillo px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm font-bold text-tinta ${saliendo ? 'anim-fundido-salir' : 'anim-arriba-entrar'}`}
      role="alert"
    >
      <WifiOff size={16} aria-hidden /> Sin conexión: te mostramos lo último que cargamos. Tu carrito queda guardado.
    </div>
  )
}

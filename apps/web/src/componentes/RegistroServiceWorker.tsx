'use client'

import { useEffect } from 'react'
import { avisar } from './Avisos'

/** Registra el service worker y avisa cuando hay una versión nueva lista. */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV === 'development') return
    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return
      recargando = true
      window.location.reload()
    })
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        const ofrecer = (sw: ServiceWorker) =>
          avisar('Hay una versión nueva de la app', 'info', { texto: 'Actualizar', fn: () => sw.postMessage({ tipo: 'ACTIVAR' }) }, 0)
        if (reg.waiting && navigator.serviceWorker.controller) ofrecer(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const nuevo = reg.installing
          nuevo?.addEventListener('statechange', () => {
            if (nuevo.state === 'installed' && navigator.serviceWorker.controller) ofrecer(nuevo)
          })
        })
        // Revisa actualizaciones cada hora mientras la app esté abierta.
        setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000)
      })
      .catch(() => {})
  }, [])
  return null
}

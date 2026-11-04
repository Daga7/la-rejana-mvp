'use client'

import { useEffect } from 'react'
import { avisar } from './Avisos'

/** Registra el service worker y avisa cuando hay una versión nueva lista. */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV === 'development') return
    // Solo se recarga cuando la persona pidió actualizar. En la primera visita el service worker también
    // toma el control (clients.claim) y dispara controllerchange: ahí NO se recarga, para no interrumpir
    // a quien ya está usando la página (p. ej. llenando el checkout).
    let pidioActualizar = false
    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!pidioActualizar || recargando) return
      recargando = true
      window.location.reload()
    })
    const registrar = () =>
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          const ofrecer = (sw: ServiceWorker) =>
            avisar(
              'Hay una versión nueva de la app',
              'info',
              {
                texto: 'Actualizar',
                fn: () => {
                  pidioActualizar = true
                  sw.postMessage({ tipo: 'ACTIVAR' })
                },
              },
              0,
            )
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
    // Después de la carga: la instalación (precarga de la página offline e íconos) no compite con la página.
    if (document.readyState === 'complete') void registrar()
    else window.addEventListener('load', () => void registrar(), { once: true })
  }, [])
  return null
}

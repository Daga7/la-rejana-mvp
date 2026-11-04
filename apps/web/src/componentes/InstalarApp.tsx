'use client'

import { Download, Share, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Ofrece instalar la PWA (Android/escritorio) o explica cómo hacerlo en iPhone. */
export function InstalarApp({ className = '' }: { className?: string }) {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)
  const [ios, setIos] = useState(false)
  const [verAyuda, setVerAyuda] = useState(false)

  useEffect(() => {
    const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
    if (instalada) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se detecta una sola vez en el cliente
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent))
    const capturar = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalacion)
    }
    window.addEventListener('beforeinstallprompt', capturar)
    return () => window.removeEventListener('beforeinstallprompt', capturar)
  }, [])

  if (!evento && !ios) return null

  return (
    <div className={className}>
      <button
        className="btn btn-fantasma btn-sm text-noche-300"
        onClick={async () => {
          if (evento) {
            await evento.prompt()
            await evento.userChoice
            setEvento(null)
          } else setVerAyuda(true)
        }}
      >
        <Download size={16} aria-hidden /> Instalar la app
      </button>
      <AnimatePresence>
        {verAyuda && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed inset-x-3 bottom-3 z-[80] rounded-2xl border-2 border-tinta bg-crema p-4 pb-seguro text-tinta shadow-sticker-lg"
            role="dialog"
            aria-label="Cómo instalar en iPhone"
          >
            <button className="absolute right-3 top-3 rounded-full p-1" onClick={() => setVerAyuda(false)} aria-label="Cerrar">
              <X size={18} />
            </button>
            <p className="font-extrabold">Instálala en tu iPhone</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              <li>
                Toca <Share size={14} className="inline" aria-label="Compartir" /> <b>Compartir</b> en Safari.
              </li>
              <li>
                Elige <b>Agregar a pantalla de inicio</b>.
              </li>
              <li>Ábrela desde el ícono: así también te llegan los avisos de tu pedido.</li>
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

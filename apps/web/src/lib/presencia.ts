import { useEffect, useState } from 'react'

/**
 * Mantiene montado un elemento mientras corre su animación CSS de salida (lo que hacía AnimatePresence
 * de Motion, sin cargar la librería en las pantallas públicas). `saliendo` indica que debe usar la clase
 * de salida; pasado `msSalida` se desmonta. Con movimiento reducido las animaciones CSS duran ~0 ms.
 */
export function usePresencia(visible: boolean, msSalida = 220): { montado: boolean; saliendo: boolean } {
  const [montado, setMontado] = useState(visible)
  const [anterior, setAnterior] = useState(visible)
  // Ajuste de estado durante el render cuando cambia la prop (patrón recomendado por React).
  if (visible !== anterior) {
    setAnterior(visible)
    if (visible) setMontado(true)
  }
  useEffect(() => {
    if (visible || !montado) return
    const t = setTimeout(() => setMontado(false), msSalida)
    return () => clearTimeout(t)
  }, [visible, montado, msSalida])
  return { montado, saliendo: montado && !visible }
}

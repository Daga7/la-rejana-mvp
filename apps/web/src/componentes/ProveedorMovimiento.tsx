'use client'

import { domAnimation, LazyMotion, MotionConfig } from 'motion/react'

/**
 * Motion liviano: los componentes usan `m` y solo se cargan las funciones de `domAnimation` (animaciones,
 * variantes, salida y gestos de toque/hover/foco). Las animaciones de layout y arrastre (`domMax`) quedan
 * fuera a propósito: pesan ~20 KB más en cada página. `strict` avisa si alguien usa `motion.*`, que traería
 * la librería completa. Además, las animaciones respetan prefers-reduced-motion del sistema.
 */
export function ProveedorMovimiento({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}

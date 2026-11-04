'use client'

import { MotionConfig } from 'motion/react'

/** Las animaciones de Motion respetan prefers-reduced-motion del sistema. */
export function ProveedorMovimiento({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

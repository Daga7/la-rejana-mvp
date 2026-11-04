import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PantallaAuth } from '@/componentes/PantallaAuth'
import { FormularioIngreso } from './FormularioIngreso'

export const metadata: Metadata = { title: 'Iniciar sesión' }

export default function Ingresar() {
  return (
    <PantallaAuth titulo="Iniciar sesión" acento="¡Qué bueno verte!">
      <Suspense>
        <FormularioIngreso />
      </Suspense>
    </PantallaAuth>
  )
}

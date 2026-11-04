import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PantallaAuth } from '@/componentes/PantallaAuth'
import { FormularioRegistro } from './FormularioRegistro'

export const metadata: Metadata = { title: 'Crear cuenta' }

export default function Registro() {
  return (
    <PantallaAuth titulo="Crea tu cuenta" acento="Guarda tus direcciones">
      <Suspense>
        <FormularioRegistro />
      </Suspense>
    </PantallaAuth>
  )
}

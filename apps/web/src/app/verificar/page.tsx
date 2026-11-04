import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PantallaAuth } from '@/componentes/PantallaAuth'
import { FormularioVerificacion } from './FormularioVerificacion'

export const metadata: Metadata = { title: 'Verifica tu correo' }

export default function Verificar() {
  return (
    <PantallaAuth titulo="Revisa tu correo" acento="Un pasito más" volver="/registro">
      <Suspense>
        <FormularioVerificacion />
      </Suspense>
    </PantallaAuth>
  )
}

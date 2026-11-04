import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PantallaAuth } from '@/componentes/PantallaAuth'
import { proveedoresOAuth } from '@/lib/api-servidor'
import { FormularioIngreso } from './FormularioIngreso'

export const metadata: Metadata = { title: 'Iniciar sesión' }

export default async function Ingresar() {
  const proveedores = await proveedoresOAuth()
  return (
    <PantallaAuth titulo="Iniciar sesión" acento="¡Qué bueno verte!">
      <Suspense>
        <FormularioIngreso proveedores={proveedores} />
      </Suspense>
    </PantallaAuth>
  )
}

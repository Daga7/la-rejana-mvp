import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PantallaAuth } from '@/componentes/PantallaAuth'
import { proveedoresOAuth } from '@/lib/api-servidor'
import { FormularioRegistro } from './FormularioRegistro'

export const metadata: Metadata = { title: 'Crear cuenta' }

export default async function Registro() {
  const proveedores = await proveedoresOAuth()
  return (
    <PantallaAuth titulo="Crea tu cuenta" acento="Guarda tus direcciones">
      <Suspense>
        <FormularioRegistro proveedores={proveedores} />
      </Suspense>
    </PantallaAuth>
  )
}

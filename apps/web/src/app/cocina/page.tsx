import type { Metadata } from 'next'
import { MarcoPersonal } from '@/componentes/personal/MarcoPersonal'
import { ModuloCocina } from '@/componentes/personal/ModuloCocina'

export const metadata: Metadata = { title: 'Cocina', robots: { index: false } }

export default function PaginaCocina() {
  return (
    <MarcoPersonal roles={['cocina', 'admin']} titulo="Cocina" ancho="max-w-7xl">
      <ModuloCocina />
    </MarcoPersonal>
  )
}

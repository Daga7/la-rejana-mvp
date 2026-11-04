import type { Metadata } from 'next'
import { MarcoPersonal } from '@/componentes/personal/MarcoPersonal'
import { ModuloDomiciliario } from '@/componentes/personal/ModuloDomiciliario'

export const metadata: Metadata = { title: 'Domicilios', robots: { index: false } }

export default function PaginaDomiciliario() {
  return (
    <MarcoPersonal roles={['domiciliario']} titulo="Domicilios" ancho="max-w-3xl">
      <ModuloDomiciliario />
    </MarcoPersonal>
  )
}

import type { Metadata } from 'next'
import { MarcoPersonal } from '@/componentes/personal/MarcoPersonal'
import { ModuloCaja } from '@/componentes/personal/ModuloCaja'

export const metadata: Metadata = { title: 'Caja', robots: { index: false } }

export default function PaginaCaja() {
  return (
    <MarcoPersonal roles={['caja', 'admin']} titulo="Caja">
      <ModuloCaja />
    </MarcoPersonal>
  )
}

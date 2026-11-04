import type { Metadata } from 'next'
import { MarcoPersonal } from '@/componentes/personal/MarcoPersonal'
import { Salon } from '@/componentes/personal/mesero/Salon'

export const metadata: Metadata = { title: 'Mesas', robots: { index: false } }

export default function PaginaMesero() {
  return (
    <MarcoPersonal roles={['mesero', 'admin']} titulo="Mesas" ancho="max-w-7xl">
      <Salon />
    </MarcoPersonal>
  )
}

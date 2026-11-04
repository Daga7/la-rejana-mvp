import type { Metadata } from 'next'
import { BuzonEmpleado } from '@/componentes/personal/Buzon'
import { MarcoPersonal } from '@/componentes/personal/MarcoPersonal'

export const metadata: Metadata = { title: 'Buzón del equipo', robots: { index: false } }

export default function PaginaBuzon() {
  return (
    <MarcoPersonal roles={['mesero', 'cocina', 'caja', 'domiciliario', 'admin']} titulo="Buzón">
      <BuzonEmpleado />
    </MarcoPersonal>
  )
}

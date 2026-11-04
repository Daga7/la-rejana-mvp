import type { Metadata } from 'next'
import { MarcoPersonal } from '@/componentes/personal/MarcoPersonal'
import { NavAdmin } from '@/componentes/personal/NavAdmin'

export const metadata: Metadata = { title: { default: 'Administración', template: '%s · Administración' }, robots: { index: false } }

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <MarcoPersonal roles={['admin']} titulo="Administración" ancho="max-w-7xl">
      <NavAdmin />
      {children}
    </MarcoPersonal>
  )
}

import type { Metadata } from 'next'
import { SedesAdmin } from '@/componentes/personal/admin/Sedes'

export const metadata: Metadata = { title: 'Sedes' }

export default function Pagina() {
  return <SedesAdmin />
}

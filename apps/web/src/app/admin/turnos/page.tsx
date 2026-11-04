import type { Metadata } from 'next'
import { TurnosAdmin } from '@/componentes/personal/admin/Turnos'

export const metadata: Metadata = { title: 'Turnos' }

export default function Pagina() {
  return <TurnosAdmin />
}

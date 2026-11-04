import type { Metadata } from 'next'
import { BuzonAdmin } from '@/componentes/personal/admin/BuzonAdmin'

export const metadata: Metadata = { title: 'Buzón' }

export default function Pagina() {
  return <BuzonAdmin />
}

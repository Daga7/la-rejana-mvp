import type { Metadata } from 'next'
import { PasaporteAdmin } from '@/componentes/personal/admin/PasaporteAdmin'

export const metadata: Metadata = { title: 'Pasaporte de sellos' }

export default function Pagina() {
  return <PasaporteAdmin />
}

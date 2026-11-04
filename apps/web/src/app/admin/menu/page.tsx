import type { Metadata } from 'next'
import { MenuAdmin } from '@/componentes/personal/admin/Menu'

export const metadata: Metadata = { title: 'Menú y recetas' }

export default function Pagina() {
  return <MenuAdmin />
}

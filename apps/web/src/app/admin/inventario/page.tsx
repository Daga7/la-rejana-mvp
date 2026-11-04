import type { Metadata } from 'next'
import { InventarioAdmin } from '@/componentes/personal/admin/Inventario'

export const metadata: Metadata = { title: 'Inventario' }

export default function Pagina() {
  return <InventarioAdmin />
}

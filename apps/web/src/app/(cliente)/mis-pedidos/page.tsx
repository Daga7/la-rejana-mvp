import type { Metadata } from 'next'
import { MisPedidos } from '@/componentes/cliente/MisPedidos'

export const metadata: Metadata = { title: 'Mis pedidos' }

export default function PaginaMisPedidos() {
  return <MisPedidos />
}

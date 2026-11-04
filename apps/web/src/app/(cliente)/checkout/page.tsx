import type { Metadata } from 'next'
import { Checkout } from '@/componentes/cliente/Checkout'

export const metadata: Metadata = { title: 'Confirmar pedido' }

export default function PaginaCheckout() {
  return <Checkout />
}

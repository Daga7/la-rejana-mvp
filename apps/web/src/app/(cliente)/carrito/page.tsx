import type { Metadata } from 'next'
import { Carrito } from '@/componentes/cliente/Carrito'

export const metadata: Metadata = { title: 'Tu carrito' }

export default function PaginaCarrito() {
  return <Carrito />
}

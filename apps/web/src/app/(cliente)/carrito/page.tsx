import type { Metadata } from 'next'
import { Carrito } from '@/componentes/cliente/Carrito'
import { ProveedorMovimiento } from '@/componentes/ProveedorMovimiento'

export const metadata: Metadata = { title: 'Tu carrito' }

export default function PaginaCarrito() {
  return (
    <ProveedorMovimiento>
      <Carrito />
    </ProveedorMovimiento>
  )
}

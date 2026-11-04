import type { Metadata } from 'next'
import { Tienda } from '@/componentes/cliente/Tienda'

export const metadata: Metadata = { title: 'Menú a domicilio' }

export default function Menu() {
  return <Tienda />
}

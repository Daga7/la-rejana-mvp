import type { Metadata } from 'next'
import { PasaporteSellos } from '@/componentes/cliente/Pasaporte'

export const metadata: Metadata = { title: 'Pasaporte de sellos', description: 'Cada compra en La Rejana Callejera te da un sello. Completa tu pasaporte y gana un premio.' }

export default function PaginaPasaporte() {
  return <PasaporteSellos />
}

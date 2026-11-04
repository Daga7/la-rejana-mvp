import type { Metadata } from 'next'
import { Tablero } from '@/componentes/personal/admin/Tablero'

export const metadata: Metadata = { title: 'Tablero' }

export default function PaginaTablero() {
  return <Tablero />
}

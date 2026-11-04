import type { Metadata } from 'next'
import { AsistenteAdmin } from '@/componentes/personal/admin/Asistente'

export const metadata: Metadata = { title: 'Asistente' }

export default function Pagina() {
  return <AsistenteAdmin />
}

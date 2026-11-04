import type { Metadata } from 'next'
import { AuditoriaAdmin } from '@/componentes/personal/admin/Auditoria'

export const metadata: Metadata = { title: 'Auditoría' }

export default function Pagina() {
  return <AuditoriaAdmin />
}

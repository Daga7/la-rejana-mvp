import type { Metadata } from 'next'
import { EmpleadosAdmin } from '@/componentes/personal/admin/Empleados'

export const metadata: Metadata = { title: 'Empleados' }

export default function Pagina() {
  return <EmpleadosAdmin />
}

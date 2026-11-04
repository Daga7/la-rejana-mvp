import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MarcoPersonal } from '@/componentes/personal/MarcoPersonal'
import { CuentaMesa } from '@/componentes/personal/mesero/CuentaMesa'

export const metadata: Metadata = { title: 'Mesa', robots: { index: false } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PaginaCuentaMesa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <MarcoPersonal roles={['mesero', 'admin']} titulo="Mesas" ancho="max-w-7xl">
      <CuentaMesa id={id} />
    </MarcoPersonal>
  )
}

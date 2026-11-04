import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ProveedorMovimiento } from '@/componentes/ProveedorMovimiento'
import { Seguimiento } from '@/componentes/cliente/Seguimiento'

export const metadata: Metadata = { title: 'Tu pedido', robots: { index: false } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PaginaPedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return (
    <ProveedorMovimiento>
      <Suspense>
        <Seguimiento id={id} />
      </Suspense>
    </ProveedorMovimiento>
  )
}

import type { Metadata } from 'next'
import { PantallaAuth } from '@/componentes/PantallaAuth'
import { proveedoresOAuth } from '@/lib/api-servidor'
import { AceptarInvitacion } from './AceptarInvitacion'

export const metadata: Metadata = { title: 'Invitación al equipo', robots: { index: false } }

export default async function Invitacion() {
  const proveedores = await proveedoresOAuth()
  return (
    <PantallaAuth titulo="Únete al equipo" acento="¡Bienvenido al parche!">
      <AceptarInvitacion proveedores={proveedores} />
    </PantallaAuth>
  )
}

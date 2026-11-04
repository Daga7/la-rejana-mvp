import type { Metadata } from 'next'
import { PantallaAuth } from '@/componentes/PantallaAuth'
import { AceptarInvitacion } from './AceptarInvitacion'

export const metadata: Metadata = { title: 'Invitación al equipo', robots: { index: false } }

export default function Invitacion() {
  return (
    <PantallaAuth titulo="Únete al equipo" acento="¡Bienvenido al parche!">
      <AceptarInvitacion />
    </PantallaAuth>
  )
}

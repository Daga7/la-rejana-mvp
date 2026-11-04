import type { Metadata } from 'next'
import { PantallaAuth } from '@/componentes/PantallaAuth'
import { FormularioRecuperacion } from './FormularioRecuperacion'

export const metadata: Metadata = { title: 'Recuperar contraseña' }

export default function Recuperar() {
  return (
    <PantallaAuth titulo="Recupera tu acceso" acento="Tranqui, pasa" volver="/ingresar">
      <FormularioRecuperacion />
    </PantallaAuth>
  )
}

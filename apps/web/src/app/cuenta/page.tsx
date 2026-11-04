import type { Metadata } from 'next'
import { RequiereSesion } from '@/componentes/RequiereSesion'
import { MiCuenta } from './MiCuenta'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default function Cuenta() {
  return (
    <main id="contenido" className="mx-auto max-w-2xl px-4 pb-28 pt-6">
      <RequiereSesion>
        <MiCuenta />
      </RequiereSesion>
    </main>
  )
}

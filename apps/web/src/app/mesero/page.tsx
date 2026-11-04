import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageSquareHeart, UserRound } from 'lucide-react'
import { RequiereSesion } from '@/componentes/RequiereSesion'

export const metadata: Metadata = { title: 'Mesero' }

/** El módulo de mesero llega después del MVP (decisión D4). Por ahora: buzón y cuenta. */
export default function Mesero() {
  return (
    <main id="contenido" className="mx-auto max-w-md px-4 py-10">
      <RequiereSesion roles={['mesero', 'admin']}>
        <div className="sticker p-6 text-center text-tinta">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/sticker-chef-fijo.webp" alt="" width={120} height={120} className="mx-auto" />
          <h1 className="mt-2 text-2xl font-black uppercase">Módulo de mesero</h1>
          <p className="mt-2 text-sm text-tinta-soft">La toma de pedidos en mesa llega en la siguiente etapa. Mientras tanto puedes usar el buzón del equipo.</p>
          <div className="mt-5 grid gap-3">
            <Link href="/buzon" className="btn btn-rosa">
              <MessageSquareHeart size={18} aria-hidden /> Buzón de quejas y sugerencias
            </Link>
            <Link href="/cuenta" className="btn btn-crema">
              <UserRound size={18} aria-hidden /> Mi cuenta
            </Link>
          </div>
        </div>
      </RequiereSesion>
    </main>
  )
}

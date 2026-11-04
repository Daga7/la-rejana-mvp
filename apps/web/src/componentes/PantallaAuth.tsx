import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Banderines, Estrellas } from './Marca'

/** Marco común de las pantallas de acceso: cielo, banderines y tarjeta tipo sticker. */
export function PantallaAuth({ titulo, acento, children, volver = '/' }: { titulo: string; acento?: string; children: ReactNode; volver?: string }) {
  return (
    <main id="contenido" className="relative isolate flex min-h-dvh flex-col">
      <Estrellas cantidad={50} />
      <Banderines />
      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-4">
        <Link prefetch={false} href={volver} className="btn btn-fantasma btn-sm -ml-3 text-noche-300">
          <ArrowLeft size={16} aria-hidden /> Volver
        </Link>
        <div className="mt-2 text-center">
          {acento && <p className="acento text-lg">{acento}</p>}
          <h1 className="titulo text-3xl sm:text-4xl">{titulo}</h1>
        </div>
        <div className="sticker mt-6 p-5 text-tinta sm:p-6">{children}</div>
      </div>
    </main>
  )
}

export function Separador({ texto = 'o' }: { texto?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-tinta-soft" aria-hidden>
      <span className="h-0.5 flex-1 bg-tinta/15" /> {texto} <span className="h-0.5 flex-1 bg-tinta/15" />
    </div>
  )
}

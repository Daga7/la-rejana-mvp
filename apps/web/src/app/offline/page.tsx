import type { Metadata } from 'next'
import Link from 'next/link'
import { Banderines, Estrellas } from '@/componentes/Marca'

export const metadata: Metadata = { title: 'Sin conexión' }

export default function SinConexion() {
  return (
    <main id="contenido" className="relative isolate flex min-h-dvh flex-col">
      <Estrellas cantidad={50} />
      <Banderines />
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/sticker-domiciliario-fijo.webp" alt="" width={160} height={160} className="animate-mecer" />
        <h1 className="titulo text-3xl">Sin señal</h1>
        <p className="text-noche-300">
          Parece que no hay internet. Tu carrito queda guardado en este dispositivo: cuando vuelva la conexión, sigue donde ibas.
        </p>
        <Link href="/menu" className="btn btn-amarillo btn-lg">
          Reintentar
        </Link>
      </div>
    </main>
  )
}

import type { Metadata } from 'next'
import { Banderines, Estrellas } from '@/componentes/Marca'
import { InstalarApp } from '@/componentes/InstalarApp'
import { OpcionesInicio } from './OpcionesInicio'

export const metadata: Metadata = { title: { absolute: 'La Rejana Callejera · Domicilios' } }

export default function Inicio() {
  return (
    <main id="contenido" className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Estrellas cantidad={80} />
      <Banderines alto={30} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-5 pb-8 pt-6 sm:pt-10">
        <div className="grid h-28 w-28 place-items-center rounded-full border-2 border-tinta bg-crema shadow-sticker sm:h-32 sm:w-32">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo.webp" alt="La Rejana Callejera" width={112} height={112} className="h-24 w-24 sm:h-28 sm:w-28" fetchPriority="high" />
        </div>
        <p className="acento mt-5 text-center text-xl">Burgers y choriperros de calle</p>
        <h1 className="titulo mt-1 text-center text-4xl sm:text-5xl">
          A domicilio
          <br />
          en Bogotá
        </h1>
        <OpcionesInicio />
        <InstalarApp className="mt-4" />
        <footer className="mt-auto pt-8 text-center text-xs text-noche-300">
          <p>Villaluz · Normandía · Lunes a domingo 12:00 m. – 10:30 p. m.</p>
          <a href="/privacidad" className="mt-2 inline-block underline underline-offset-4 hover:text-white">
            Aviso de privacidad y tratamiento de datos
          </a>
        </footer>
      </div>
    </main>
  )
}

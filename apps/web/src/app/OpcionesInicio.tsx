'use client'

import { INICIO_ROL, NOMBRE_ROL } from '@rejana/shared'
import { ArrowRight, LogIn, ShoppingBag, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useSesion } from '@/lib/sesion'

const retraso = (i: number) => ({ animationDelay: `${0.08 * i}s` })

export function OpcionesInicio() {
  const { usuario, cargando } = useSesion()

  if (!cargando && usuario) {
    return (
      <div className="sticker aparecer mt-8 w-full p-5 text-tinta">
        <p className="text-sm font-semibold text-tinta-soft">Hola de nuevo</p>
        <p className="text-xl font-black">{usuario.nombre}</p>
        <Link href={INICIO_ROL[usuario.rol]} className="btn btn-rosa btn-lg mt-4 w-full">
          {usuario.rol === 'cliente' ? 'Ir al menú' : `Ir a ${NOMBRE_ROL[usuario.rol]}`} <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
    )
  }

  return (
    <nav aria-label="Cómo quieres entrar" className="mt-8 flex w-full flex-col gap-3">
      <div className="aparecer" style={retraso(0)}>
        <Link href="/menu" className="btn btn-amarillo btn-lg w-full justify-between">
          <span className="flex items-center gap-2">
            <ShoppingBag size={20} aria-hidden /> Continuar como invitado
          </span>
          <ArrowRight size={18} aria-hidden />
        </Link>
        <p className="mt-1.5 text-center text-xs text-noche-300">Mira el menú y pide sin registrarte</p>
      </div>
      <div className="aparecer" style={retraso(1)}>
        <Link href="/ingresar" className="btn btn-blanco btn-lg w-full justify-between">
          <span className="flex items-center gap-2">
            <LogIn size={20} aria-hidden /> Iniciar sesión
          </span>
          <ArrowRight size={18} aria-hidden />
        </Link>
      </div>
      <div className="aparecer" style={retraso(2)}>
        <Link href="/registro" className="btn btn-rosa btn-lg w-full justify-between">
          <span className="flex items-center gap-2">
            <UserPlus size={20} aria-hidden /> Registrarse
          </span>
          <ArrowRight size={18} aria-hidden />
        </Link>
        <p className="mt-1.5 text-center text-xs text-noche-300">Guarda tus direcciones y tu historial de pedidos</p>
      </div>
    </nav>
  )
}

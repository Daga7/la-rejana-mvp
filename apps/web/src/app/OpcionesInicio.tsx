'use client'

import { INICIO_ROL, NOMBRE_ROL } from '@rejana/shared'
import { ArrowRight, LogIn, ShoppingBag, UserPlus } from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useSesion } from '@/lib/sesion'

const aparecer = {
  oculto: { opacity: 0, y: 18 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, type: 'spring' as const, stiffness: 260, damping: 24 } }),
}

export function OpcionesInicio() {
  const { usuario, cargando } = useSesion()

  if (!cargando && usuario) {
    return (
      <motion.div initial="oculto" animate="visible" custom={0} variants={aparecer} className="sticker mt-8 w-full p-5 text-tinta">
        <p className="text-sm font-semibold text-tinta-soft">Hola de nuevo</p>
        <p className="text-xl font-black">{usuario.nombre}</p>
        <Link href={INICIO_ROL[usuario.rol]} className="btn btn-rosa btn-lg mt-4 w-full">
          {usuario.rol === 'cliente' ? 'Ir al menú' : `Ir a ${NOMBRE_ROL[usuario.rol]}`} <ArrowRight size={18} aria-hidden />
        </Link>
      </motion.div>
    )
  }

  return (
    <nav aria-label="Cómo quieres entrar" className="mt-8 flex w-full flex-col gap-3">
      <motion.div initial="oculto" animate="visible" custom={0} variants={aparecer}>
        <Link href="/menu" className="btn btn-amarillo btn-lg w-full justify-between">
          <span className="flex items-center gap-2">
            <ShoppingBag size={20} aria-hidden /> Continuar como invitado
          </span>
          <ArrowRight size={18} aria-hidden />
        </Link>
        <p className="mt-1.5 text-center text-xs text-noche-300">Mira el menú y pide sin registrarte</p>
      </motion.div>
      <motion.div initial="oculto" animate="visible" custom={1} variants={aparecer}>
        <Link href="/ingresar" className="btn btn-blanco btn-lg w-full justify-between">
          <span className="flex items-center gap-2">
            <LogIn size={20} aria-hidden /> Iniciar sesión
          </span>
          <ArrowRight size={18} aria-hidden />
        </Link>
      </motion.div>
      <motion.div initial="oculto" animate="visible" custom={2} variants={aparecer}>
        <Link href="/registro" className="btn btn-rosa btn-lg w-full justify-between">
          <span className="flex items-center gap-2">
            <UserPlus size={20} aria-hidden /> Registrarse
          </span>
          <ArrowRight size={18} aria-hidden />
        </Link>
        <p className="mt-1.5 text-center text-xs text-noche-300">Guarda tus direcciones y tu historial de pedidos</p>
      </motion.div>
    </nav>
  )
}

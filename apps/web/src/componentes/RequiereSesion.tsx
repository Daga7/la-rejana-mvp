'use client'

import { INICIO_ROL, NOMBRE_ROL, type Rol } from '@rejana/shared'
import { ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSesion } from '@/lib/sesion'

/**
 * Protege una pantalla en el cliente (experiencia de usuario). La autorización real la hace la API
 * en cada caso de uso: aunque alguien salte este guardián, no obtiene datos.
 */
export function RequiereSesion({ roles, children }: { roles?: Rol[]; children: React.ReactNode }) {
  const { usuario, cargando } = useSesion()
  const router = useRouter()
  const ruta = usePathname()

  useEffect(() => {
    if (!cargando && !usuario) router.replace(`/ingresar?volver=${encodeURIComponent(ruta)}`)
  }, [cargando, usuario, router, ruta])

  if (cargando || !usuario) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4 p-6" aria-busy aria-label="Cargando">
        <div className="esqueleto h-10 w-1/2" />
        <div className="esqueleto h-32" />
        <div className="esqueleto h-32" />
      </div>
    )
  }
  if (roles && !roles.includes(usuario.rol)) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="sticker p-6 text-center text-tinta">
          <ShieldAlert className="mx-auto text-rojo" size={40} aria-hidden />
          <h1 className="mt-3 text-xl font-black">Esta sección no es para tu rol</h1>
          <p className="mt-2 text-sm text-tinta-soft">Entraste como {NOMBRE_ROL[usuario.rol]}.</p>
          <Link href={INICIO_ROL[usuario.rol]} className="btn btn-rosa mt-5">
            Ir a mi módulo
          </Link>
        </div>
      </div>
    )
  }
  return <>{children}</>
}

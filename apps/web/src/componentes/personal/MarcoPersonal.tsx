'use client'

import { NOMBRE_ROL, type Rol, type SedePublicaDTO } from '@rejana/shared'
import { ChefHat, LayoutDashboard, LogOut, MessageSquareHeart, Receipt, UserRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { ProveedorMovimiento } from '@/componentes/ProveedorMovimiento'
import { RequiereSesion } from '@/componentes/RequiereSesion'
import { obtener } from '@/lib/api'
import { useSesion } from '@/lib/sesion'

/**
 * Marco de los módulos del personal: barra superior con módulo, sede, buzón, cuenta y salir.
 * Los módulos del personal sí usan Motion (tablero de cocina, caja, ruta), así que se carga aquí.
 */
export function MarcoPersonal({ roles, titulo, children, ancho = 'max-w-6xl' }: { roles: Rol[]; titulo: string; children: React.ReactNode; ancho?: string }) {
  return (
    <ProveedorMovimiento>
      <RequiereSesion roles={roles}>
        <Barra titulo={titulo} />
        <main id="contenido" className={`mx-auto ${ancho} px-4 pb-24 pt-4`}>
          {children}
        </main>
      </RequiereSesion>
    </ProveedorMovimiento>
  )
}

function Barra({ titulo }: { titulo: string }) {
  const { usuario, salir } = useSesion()
  const router = useRouter()
  const ruta = usePathname()
  const { data } = useSWR<{ sedes: SedePublicaDTO[] }>('/sedes', obtener)
  const sede = data?.sedes.find((s) => s.id === usuario?.sedeId)
  if (!usuario) return null
  const enlace = (href: string, activo: boolean) => `btn btn-sm ${activo ? 'btn-amarillo' : 'btn-fantasma text-white'}`
  return (
    <header className="sticky top-0 z-30 border-b-2 border-tinta bg-noche-950/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/iconos/icono.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
        <div className="mr-auto leading-tight">
          <p className="text-sm font-black uppercase">{titulo}</p>
          <p className="text-xs text-noche-300">
            {usuario.nombre.split(' ')[0]} · {NOMBRE_ROL[usuario.rol]}
            {sede ? ` · ${sede.nombre}` : usuario.rol === 'admin' ? ' · Todas las sedes' : ''}
          </p>
        </div>
        {usuario.rol === 'admin' && (
          <nav className="flex gap-1" aria-label="Módulos">
            <Link href="/admin" className={enlace('/admin', ruta.startsWith('/admin'))}>
              <LayoutDashboard size={16} aria-hidden /> <span className="hidden sm:inline">Admin</span>
            </Link>
            <Link href="/cocina" className={enlace('/cocina', ruta.startsWith('/cocina'))}>
              <ChefHat size={16} aria-hidden /> <span className="hidden sm:inline">Cocina</span>
            </Link>
            <Link href="/caja" className={enlace('/caja', ruta.startsWith('/caja'))}>
              <Receipt size={16} aria-hidden /> <span className="hidden sm:inline">Caja</span>
            </Link>
          </nav>
        )}
        {usuario.rol !== 'admin' && (
          <Link href="/buzon" className="btn btn-fantasma btn-sm text-white" aria-label="Buzón de quejas y sugerencias">
            <MessageSquareHeart size={16} aria-hidden /> <span className="hidden sm:inline">Buzón</span>
          </Link>
        )}
        <Link href="/cuenta" className="btn btn-fantasma btn-sm text-white" aria-label="Mi cuenta">
          <UserRound size={16} aria-hidden />
        </Link>
        <button
          className="btn btn-fantasma btn-sm text-white"
          aria-label="Cerrar sesión"
          onClick={async () => {
            await salir()
            avisar('Cerraste sesión')
            router.replace('/ingresar')
          }}
        >
          <LogOut size={16} aria-hidden />
        </button>
      </div>
    </header>
  )
}

'use client'

import { Boxes, ClipboardList, LayoutDashboard, MapPinned, MessageSquareHeart, Sparkles, UtensilsCrossed, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SECCIONES = [
  { href: '/admin', texto: 'Tablero', icono: LayoutDashboard, exacto: true },
  { href: '/admin/inventario', texto: 'Inventario', icono: Boxes },
  { href: '/admin/menu', texto: 'Menú y recetas', icono: UtensilsCrossed },
  { href: '/admin/sedes', texto: 'Sedes', icono: MapPinned },
  { href: '/admin/empleados', texto: 'Empleados', icono: Users },
  { href: '/admin/buzon', texto: 'Buzón', icono: MessageSquareHeart },
  { href: '/admin/asistente', texto: 'Asistente', icono: Sparkles },
  { href: '/admin/auditoria', texto: 'Auditoría', icono: ClipboardList },
]

export function NavAdmin() {
  const ruta = usePathname()
  return (
    <nav className="sin-scroll -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Secciones de administración">
      {SECCIONES.map((s) => {
        const activo = s.exacto ? ruta === s.href : ruta.startsWith(s.href)
        const Icono = s.icono
        return (
          <Link key={s.href} href={s.href} aria-current={activo ? 'page' : undefined} className={`btn btn-sm shrink-0 ${activo ? 'btn-amarillo' : 'btn-noche'}`}>
            <Icono size={16} aria-hidden /> {s.texto}
          </Link>
        )
      })}
    </nav>
  )
}

'use client'

import { cop } from '@rejana/shared'
import { ReceiptText, ShoppingBag, Stamp, UserRound, UtensilsCrossed } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { Banderines } from '@/componentes/Marca'
import { subtotal, totalItems, useCarrito } from '@/lib/carrito'
import { useSesion } from '@/lib/sesion'

/** El carrito vive en localStorage: en el servidor no existe todavía (evita desajustes de hidratación). */
export function useHidratado() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

function BotonCarrito() {
  const items = useCarrito((s) => s.items)
  const hidratado = useHidratado()
  const n = hidratado ? totalItems(items) : 0
  return (
    <Link prefetch={false} href="/carrito" className="btn btn-rosa relative ml-auto !px-4" aria-label={`Carrito, ${n} productos`}>
      <ShoppingBag size={18} aria-hidden />
      <span className="hidden tabular-nums sm:inline">{n > 0 ? cop(subtotal(items)) : 'Carrito'}</span>
      {n > 0 && (
        // key={n}: cada vez que cambia la cantidad, la insignia rebota.
        <span key={n} className="anim-rebote absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-tinta bg-amarillo px-1 text-xs font-black text-tinta">
          {n}
        </span>
      )}
    </Link>
  )
}

export function EncabezadoCliente() {
  const { usuario } = useSesion()
  const ruta = usePathname()
  const enlace = (href: string) => `rounded-full px-4 py-2 text-sm font-bold transition ${ruta.startsWith(href) ? 'bg-white text-tinta' : 'text-white hover:bg-white/10'}`
  return (
    <header className="sticky top-0 z-30 border-b-2 border-tinta bg-noche-900/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link prefetch={false} href="/menu" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo.webp" alt="" width={44} height={44} className="h-11 w-11 rounded-full border-2 border-tinta bg-crema" />
          <span className="leading-tight">
            <span className="block font-black uppercase tracking-tight">La Rejana</span>
            <span className="acento block text-xs">Domicilios</span>
            <span className="sr-only">, ir al menú</span>
          </span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Principal">
          <Link prefetch={false} href="/menu" className={enlace('/menu')}>
            Menú
          </Link>
          <Link prefetch={false} href="/mis-pedidos" className={enlace('/mis-pedidos')}>
            Mis pedidos
          </Link>
          <Link prefetch={false} href="/pasaporte" className={enlace('/pasaporte')}>
            Pasaporte
          </Link>
          <Link prefetch={false} href={usuario ? '/cuenta' : '/ingresar?volver=/menu'} className={enlace('/cuenta')}>
            {usuario ? usuario.nombre.split(' ')[0] : 'Ingresar'}
          </Link>
        </nav>
        <BotonCarrito />
      </div>
    </header>
  )
}

export function NavInferior() {
  const ruta = usePathname()
  const { usuario } = useSesion()
  const items = useCarrito((s) => s.items)
  const hidratado = useHidratado()
  const n = hidratado ? totalItems(items) : 0
  const clase = (activo: boolean) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${activo ? 'text-amarillo' : 'text-noche-300'}`
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t-2 border-tinta bg-noche-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Navegación">
      <Link prefetch={false} href="/menu" className={clase(ruta.startsWith('/menu'))}>
        <UtensilsCrossed size={22} aria-hidden /> Menú
      </Link>
      <Link prefetch={false} href="/mis-pedidos" className={clase(ruta.startsWith('/mis-pedidos') || ruta.startsWith('/pedido'))}>
        <ReceiptText size={22} aria-hidden /> Pedidos
      </Link>
      <Link prefetch={false} href="/pasaporte" className={clase(ruta.startsWith('/pasaporte'))}>
        <Stamp size={22} aria-hidden /> Pasaporte
      </Link>
      <Link prefetch={false} href="/carrito" className={clase(ruta.startsWith('/carrito') || ruta.startsWith('/checkout'))}>
        <span className="relative">
          <ShoppingBag size={22} aria-hidden />
          {n > 0 && <span className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-rosa-500 px-1 text-[10px] font-bold text-white">{n}</span>}
        </span>
        Carrito
      </Link>
      <Link prefetch={false} href={usuario ? '/cuenta' : '/ingresar?volver=/menu'} className={clase(ruta.startsWith('/cuenta') || ruta.startsWith('/ingresar'))}>
        <UserRound size={22} aria-hidden /> {usuario ? 'Cuenta' : 'Ingresar'}
      </Link>
    </nav>
  )
}

// Enlaces sin prefetch: las páginas son dinámicas (CSP con nonce), así que el prefetch casi no adelanta nada
// y, en cambio, compite con la carga inicial del menú en celulares.
export function MarcoCliente({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Banderines alto={20} cantidad={60} />
      <EncabezadoCliente />
      <main id="contenido" className="mx-auto min-h-[70dvh] max-w-6xl px-4 pb-28 md:pb-12">
        {children}
      </main>
      <NavInferior />
    </>
  )
}

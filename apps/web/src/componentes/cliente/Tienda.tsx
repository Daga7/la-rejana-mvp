'use client'

import { cop, type MenuDTO, type ProductoMenuDTO, type SedePublicaDTO } from '@rejana/shared'
import { Bike, Clock, MapPin, RefreshCw, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { memo, useEffect, useState } from 'react'
import useSWR from 'swr'
import { usePresencia } from '@/lib/presencia'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { obtener } from '@/lib/api'
import { subtotal, totalItems, useCarrito } from '@/lib/carrito'
import { HojaProducto } from './HojaProducto'
import { useHidratado } from './MarcoCliente'
import { EsqueletoProducto, TarjetaProducto } from './TarjetaProducto'

/** 14:30 → 2:30 p. m. */
export function hora12(hhmm: string): string {
  const [h, min] = hhmm.split(':').map(Number) as [number, number]
  if (h === 12 && min === 0) return '12:00 m.'
  const sufijo = h < 12 ? 'a. m.' : 'p. m.'
  return `${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, '0')} ${sufijo}`
}

export function Tienda() {
  const router = useRouter()
  const hidratado = useHidratado()
  const { sedeId, items, elegirSede, agregar } = useCarrito()
  const { data: datosSedes, error: errorSedes, mutate: recargarSedes } = useSWR<{ sedes: SedePublicaDTO[] }>('/sedes', obtener)
  const sedes = datosSedes?.sedes ?? []
  // Durante la hidratación se usa la sede por defecto, igual que el HTML del servidor (que no conoce el
  // carrito guardado en este navegador); justo después se aplica la sede del carrito.
  const sedeGuardada = hidratado ? sedeId : null
  const sede = sedes.find((s) => s.id === sedeGuardada) ?? sedes.find((s) => s.abierta) ?? sedes[0]
  const { data: menu, error: errorMenu, isLoading, mutate } = useSWR<MenuDTO>(sede ? `/sedes/${sede.id}/menu` : null, obtener, { refreshInterval: 60_000, revalidateOnFocus: true })
  const [elegido, setElegido] = useState<ProductoMenuDTO | null>(null)
  const [cambioPendiente, setCambioPendiente] = useState<SedePublicaDTO | null>(null)
  const [verSedes, setVerSedes] = useState(false)

  // Fija la sede por defecto (la primera abierta) cuando el carrito todavía no tiene una.
  useEffect(() => {
    if (hidratado && sede && !sedeId) elegirSede(sede.id)
  }, [hidratado, sede, sedeId, elegirSede])

  const n = hidratado ? totalItems(items) : 0
  const barraCarrito = usePresencia(n > 0)
  const irA = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const pedirCambioSede = (s: SedePublicaDTO) => {
    setVerSedes(false)
    if (s.id === sede?.id) return
    if (items.length > 0) setCambioPendiente(s)
    else elegirSede(s.id)
  }

  if (errorSedes && !datosSedes) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-bold">No pudimos cargar el menú.</p>
        <p className="mt-1 text-noche-300">Revisa tu conexión e inténtalo de nuevo.</p>
        <button className="btn btn-amarillo mt-5" onClick={() => void recargarSedes()}>
          <RefreshCw size={16} aria-hidden /> Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="pb-6">
      {/* Portada */}
      <section className="grid gap-4 pt-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="sticker relative overflow-hidden !bg-azul p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/banner-domicilio.webp" alt="Llevamos el parche a tu casa: burgers y choriperros a domicilio" width={960} height={540} fetchPriority="high" className="aspect-video w-full object-cover" />
        </div>
        <div className="sticker flex flex-col gap-3 !bg-noche-800 p-5 text-white">
          <p className="acento text-lg leading-tight">Burgers y choriperros</p>
          <h1 className="titulo text-3xl">Pide a domicilio</h1>
          {sede ? (
            <>
              <div className="flex flex-wrap gap-2">
                <span className={`chip border-2 border-tinta ${sede.abierta ? 'bg-turquesa text-tinta' : 'bg-rojo-500 text-white'}`}>
                  <Clock size={13} aria-hidden /> {sede.abierta ? `Abierto · hasta las ${hora12(sede.horaCierre)}` : `Cerrado · abrimos a las ${hora12(sede.horaApertura)}`}
                </span>
                <span className="chip border-2 border-tinta bg-amarillo text-tinta">
                  <Bike size={13} aria-hidden /> Domicilio {cop(sede.tarifaDomicilio)} · {sede.minutosPreparacion + 15}–{sede.minutosPreparacion + 30} min
                </span>
              </div>
              <button className="campo flex items-center gap-2 text-left font-semibold" onClick={() => setVerSedes(true)} aria-haspopup="dialog">
                <MapPin size={18} className="shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  Sede {sede.nombre} · {sede.direccion}
                </span>
                <span className="text-xs font-bold text-rosa-600">Cambiar</span>
              </button>
            </>
          ) : (
            <div className="grid gap-2">
              <div className="esqueleto h-6 w-3/4" />
              <div className="esqueleto h-11" />
            </div>
          )}
          <button className="btn btn-rosa btn-lg mt-auto" onClick={() => irA('menu')}>
            ¡Pide ahora!
          </button>
        </div>
      </section>

      {/* Categorías */}
      <div id="menu" className="sticky top-[66px] z-20 -mx-4 mt-6 scroll-mt-24 bg-noche-900/90 px-4 py-3 backdrop-blur-md">
        <div className="sin-scroll flex gap-2 overflow-x-auto">
          {(menu?.categorias ?? []).map((c) => (
            <button key={c.id} onClick={() => irA(`cat-${c.slug}`)} className="shrink-0 rounded-full border-2 border-tinta bg-white px-4 py-2 text-sm font-bold text-tinta shadow-sticker-sm hover:bg-crema-200">
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {isLoading || (!menu && !errorMenu) ? (
        <section aria-busy aria-label="Cargando el menú" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <EsqueletoProducto key={i} />
          ))}
        </section>
      ) : errorMenu && !menu ? (
        <div className="py-12 text-center">
          <p className="font-bold">No pudimos cargar el menú de esta sede.</p>
          <button className="btn btn-amarillo mt-4" onClick={() => void mutate()}>
            <RefreshCw size={16} aria-hidden /> Reintentar
          </button>
        </div>
      ) : (
        menu && <ListaMenu menu={menu} onElegir={setElegido} />
      )}

      {/* Barra flotante del carrito (celular) */}
      {barraCarrito.montado && (
        <div className={`fixed inset-x-4 bottom-20 z-20 md:hidden ${barraCarrito.saliendo ? 'anim-aviso-salir' : 'anim-aviso-entrar'}`}>
          <Link prefetch={false} href="/carrito" className="btn btn-rosa btn-lg w-full justify-between">
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} aria-hidden /> Ver carrito ({n})
            </span>
            <span className="tabular-nums">{cop(subtotal(items))}</span>
          </Link>
        </div>
      )}

      <HojaProducto
        producto={elegido}
        onCerrar={() => setElegido(null)}
        onAgregar={(cantidad, notas) => {
          if (!elegido || !sede) return
          if (sedeId !== sede.id) elegirSede(sede.id)
          agregar({ productoId: elegido.id, nombre: elegido.nombre, precio: elegido.precio, imagenUrl: elegido.imagenUrl }, cantidad, notas)
          avisar(`${elegido.nombre} ×${cantidad} al carrito`, 'ok', { texto: 'Ver carrito', fn: () => router.push('/carrito') })
          setElegido(null)
        }}
      />

      <Hoja abierta={verSedes} onCerrar={() => setVerSedes(false)} titulo="¿Desde qué sede te atendemos?">
        <ul className="grid gap-3">
          {sedes.map((s) => (
            <li key={s.id}>
              <button onClick={() => pedirCambioSede(s)} className={`sticker-blanco w-full p-4 text-left ${s.id === sede?.id ? 'outline outline-3 outline-rosa' : ''}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-extrabold">Sede {s.nombre}</span>
                  <span className={`chip ${s.abierta ? 'bg-turquesa-100 text-turquesa-700' : 'bg-rojo-100 text-rojo-600'}`}>{s.abierta ? 'Abierta' : 'Cerrada'}</span>
                </span>
                <span className="mt-1 block text-sm text-tinta-soft">
                  {s.direccion} · {s.barrio}
                </span>
                <span className="mt-1 block text-xs text-tinta-soft">
                  Domicilio {cop(s.tarifaDomicilio)} · cubre {s.radioEntregaKm} km a la redonda
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Hoja>

      <Hoja abierta={!!cambioPendiente} onCerrar={() => setCambioPendiente(null)} titulo="¿Cambiar de sede?">
        <p className="text-sm">Cada sede tiene su propio menú y precios. Si cambias a {cambioPendiente?.nombre}, vaciamos tu carrito.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="btn btn-crema" onClick={() => setCambioPendiente(null)}>
            Seguir en {sede?.nombre}
          </button>
          <button
            className="btn btn-rosa"
            onClick={() => {
              if (cambioPendiente) elegirSede(cambioPendiente.id)
              setCambioPendiente(null)
            }}
          >
            Cambiar y vaciar
          </button>
        </div>
      </Hoja>
    </div>
  )
}

/** Lista del menú por categorías. Memorizada: solo se vuelve a pintar cuando cambia el menú. */
const ListaMenu = memo(function ListaMenu({ menu, onElegir }: { menu: MenuDTO; onElegir: (p: ProductoMenuDTO) => void }) {
  return menu.categorias.map((c, ci) => (
    <section key={c.id} id={`cat-${c.slug}`} className="scroll-mt-36 pt-8" aria-labelledby={`t-${c.slug}`}>
      <h2 id={`t-${c.slug}`} className="titulo text-2xl sm:text-3xl">
        {c.nombre}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {c.productos.map((p, pi) => (
          <TarjetaProducto key={p.id} producto={p} prioridad={ci === 0 && pi < 2} onElegir={onElegir} />
        ))}
      </div>
    </section>
  ))
})

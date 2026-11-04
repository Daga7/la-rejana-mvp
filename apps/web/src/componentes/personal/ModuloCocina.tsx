'use client'

import { hora, type EstadoPedido, type PedidoDTO } from '@rejana/shared'
import { Bike, ChefHat, CircleCheckBig, Flame, Inbox } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { api, ErrorApi, obtener } from '@/lib/api'
import { useTiempoReal } from '@/lib/tiempo-real'
import { BotonSonido, SelectorSede, sonarCampana, Transcurrido, useSedeOperacion } from './comunes'

const COLUMNAS: { estado: EstadoPedido; titulo: string; icono: typeof Inbox; accion?: { a: EstadoPedido; texto: string; clase: string } }[] = [
  { estado: 'recibido', titulo: 'Nuevos', icono: Inbox, accion: { a: 'en_preparacion', texto: 'Empezar', clase: 'btn-amarillo' } },
  { estado: 'en_preparacion', titulo: 'En la parrilla', icono: Flame, accion: { a: 'listo', texto: '¡Listo!', clase: 'btn-turquesa' } },
  { estado: 'listo', titulo: 'Listos para salir', icono: CircleCheckBig },
]

export function ModuloCocina() {
  const { sedeId, sede } = useSedeOperacion()
  const clave = sedeId ? `/operacion/pedidos?sedeId=${sedeId}&estados=recibido,en_preparacion,listo` : null
  const { data, mutate } = useSWR<{ pedidos: PedidoDTO[] }>(clave, obtener, { refreshInterval: 30_000 })
  const [sonido, setSonido] = useState(false)
  const [pendientes, setPendientes] = useState<Record<string, EstadoPedido>>({})
  const vistos = useRef<Set<string> | null>(null)

  const { conectado } = useTiempoReal({ activo: !!sedeId }, { 'pedido:actualizado': () => void mutate() })

  // Campana cuando aparece un pedido que no se había visto.
  useEffect(() => {
    if (!data) return
    const ids = new Set(data.pedidos.filter((p) => p.estado === 'recibido').map((p) => p.id))
    if (vistos.current) {
      const nuevos = [...ids].filter((id) => !vistos.current!.has(id))
      if (nuevos.length) {
        if (sonido) sonarCampana()
        avisar(nuevos.length === 1 ? '¡Pedido nuevo!' : `¡${nuevos.length} pedidos nuevos!`, 'info')
      }
    }
    vistos.current = new Set([...(vistos.current ?? []), ...ids])
  }, [data, sonido])

  const pedidos = (data?.pedidos ?? []).map((p) => (pendientes[p.id] ? { ...p, estado: pendientes[p.id]! } : p))

  async function mover(p: PedidoDTO, a: EstadoPedido) {
    setPendientes((x) => ({ ...x, [p.id]: a })) // optimista
    try {
      await api(`/pedidos/${p.id}/estado`, { metodo: 'PATCH', cuerpo: { estado: a } })
      await mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo cambiar el estado', 'error')
    } finally {
      setPendientes((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== p.id)))
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titulo mr-auto text-3xl">
          Cocina <span className="acento text-xl normal-case">{sede?.nombre}</span>
        </h1>
        <span className={`chip ${conectado ? 'bg-turquesa-100 text-turquesa-600' : 'bg-white/10 text-noche-300'}`}>{conectado ? '● En vivo' : '○ Reconectando'}</span>
        <BotonSonido activo={sonido} onCambiar={setSonido} />
        <SelectorSede />
      </div>
      {!data ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto h-80" />
          ))}
        </div>
      ) : (
        <LayoutGroup>
          <div className="grid items-start gap-4 md:grid-cols-3">
            {COLUMNAS.map((col) => {
              const lista = pedidos.filter((p) => p.estado === col.estado).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
              const Icono = col.icono
              return (
                <section key={col.estado} className="rounded-3xl border-2 border-noche-700 bg-noche-950/50 p-3" aria-labelledby={`col-${col.estado}`}>
                  <h2 id={`col-${col.estado}`} className="mb-3 flex items-center gap-2 px-1 text-sm font-black uppercase tracking-wider">
                    <Icono size={18} aria-hidden /> {col.titulo}
                    <span className="ml-auto grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-tinta">{lista.length}</span>
                  </h2>
                  <div className="grid gap-3">
                    <AnimatePresence mode="popLayout">
                      {lista.map((p) => (
                        <motion.article
                          key={p.id}
                          layoutId={p.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          className="sticker p-4 text-tinta"
                        >
                          <header className="flex items-center gap-2">
                            <span className="text-xl font-black">#{p.numero}</span>
                            <span className="text-xs text-tinta-soft">{hora(p.creadoEn)}</span>
                            <span className="ml-auto">
                              <Transcurrido desde={p.creadoEn} />
                            </span>
                          </header>
                          <ul className="mt-3 grid gap-1.5">
                            {p.items.map((i) => (
                              <li key={i.id} className="text-lg leading-tight">
                                <b className="tabular-nums">{i.cantidad}×</b> {i.nombre}
                                {i.notas && <span className="mt-0.5 block rounded-lg bg-amarillo-100 px-2 py-0.5 text-sm font-bold text-tinta">⚠ {i.notas}</span>}
                              </li>
                            ))}
                          </ul>
                          {p.notas && <p className="mt-2 text-xs text-tinta-soft">Nota del cliente: {p.notas}</p>}
                          {col.estado === 'listo' && (
                            <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold">
                              <Bike size={16} aria-hidden /> {p.domiciliarioNombre ?? 'Sin domiciliario asignado'}
                            </p>
                          )}
                          {col.accion && (
                            <button className={`btn btn-lg mt-3 w-full ${col.accion.clase}`} onClick={() => void mover(p, col.accion!.a)} disabled={!!pendientes[p.id]}>
                              {col.accion.texto}
                            </button>
                          )}
                        </motion.article>
                      ))}
                    </AnimatePresence>
                    {lista.length === 0 && (
                      <p className="flex flex-col items-center gap-2 py-8 text-center text-sm text-noche-300">
                        <ChefHat size={28} aria-hidden /> Nada por aquí
                      </p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </LayoutGroup>
      )}
    </div>
  )
}

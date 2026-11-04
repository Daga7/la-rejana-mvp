'use client'

import { cop, hora, minutosDesde, NOMBRE_ESTADO_MESA, type CuentaMesaDTO, type MesaSalonDTO, type PedidoDTO, type SalonDTO } from '@rejana/shared'
import { BellRing, Check, ChevronRight, Minus, Plus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { useTiempoReal } from '@/lib/tiempo-real'
import { BotonSonido, SelectorSede, sonarCampana, useSedeOperacion, useTic } from '../comunes'
import { ESTILO_MESA, LeyendaMesas, vibrar } from './comunes'

export function Salon() {
  const { sedeId, sede } = useSedeOperacion()
  const { usuario } = useSesion()
  const router = useRouter()
  const { data, mutate } = useSWR<{ salon: SalonDTO }>(sedeId ? `/mesas/${sedeId}/salon` : null, obtener, { refreshInterval: 30_000 })
  const [abrir, setAbrir] = useState<MesaSalonDTO | null>(null)
  const [sonido, setSonido] = useState(false)
  const [sirviendo, setSirviendo] = useState<string | null>(null)
  const vistos = useRef<Set<string> | null>(null)
  useTic()

  const { conectado } = useTiempoReal(
    { activo: !!sedeId },
    {
      'pedido:actualizado': (p: PedidoDTO) => {
        if (p.canal === 'mesa') void mutate()
      },
      'cuenta:actualizada': () => void mutate(),
    },
  )

  const salon = data?.salon
  // Aviso (sonido y vibración) cuando la cocina deja algo listo que no se había visto.
  useEffect(() => {
    if (!salon) return
    const ids = new Set(salon.paraServir.map((r) => r.id))
    if (vistos.current) {
      const nuevos = salon.paraServir.filter((r) => !vistos.current!.has(r.id))
      if (nuevos.length) {
        if (sonido) sonarCampana()
        vibrar()
        const r = nuevos[0]!
        avisar(nuevos.length === 1 && r.canal === 'mesa' ? `¡Mesa ${r.mesa.numero}: ronda lista para servir!` : `¡${nuevos.length} rondas listas para servir!`, 'info')
      }
    }
    vistos.current = new Set([...(vistos.current ?? []), ...ids])
  }, [salon, sonido])

  async function servir(id: string) {
    setSirviendo(id)
    try {
      await api(`/pedidos/${id}/estado`, { metodo: 'PATCH', cuerpo: { estado: 'entregado' } })
      avisar('Marcado como servido')
      await mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo marcar como servido', 'error')
    } finally {
      setSirviendo(null)
    }
  }

  const zonas = new Map<string, MesaSalonDTO[]>()
  for (const m of salon?.mesas ?? []) zonas.set(m.zona ?? 'Salón', [...(zonas.get(m.zona ?? 'Salón') ?? []), m])
  const misMesas = (salon?.mesas ?? []).filter((m) => m.cuenta && m.cuenta.meseroId === usuario?.id)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titulo mr-auto text-3xl">
          Salón <span className="acento text-xl normal-case">{sede?.nombre}</span>
        </h1>
        <span className={`chip ${conectado ? 'bg-turquesa-100 text-turquesa-700' : 'bg-white/10 text-noche-300'}`}>{conectado ? '● En vivo' : '○ Reconectando'}</span>
        <BotonSonido activo={sonido} onCambiar={setSonido} />
        <SelectorSede />
      </div>

      {!salon ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="esqueleto h-96" />
          <div className="esqueleto h-64" />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
          {/* Listo para servir: primero en el celular, a la derecha en pantallas grandes */}
          <aside className="grid gap-4 lg:order-2">
            <section className="rounded-3xl border-2 border-tinta bg-amarillo p-4 text-tinta shadow-sticker" aria-labelledby="t-servir">
              <h2 id="t-servir" className="flex items-center gap-2 font-black uppercase">
                <BellRing size={18} className={salon.paraServir.length ? 'animate-latido' : ''} aria-hidden /> Listo para servir
                <span className="ml-auto grid h-7 min-w-7 place-items-center rounded-full border-2 border-tinta bg-white px-1.5 text-sm">{salon.paraServir.length}</span>
              </h2>
              {salon.paraServir.length === 0 ? (
                <p className="mt-2 text-sm">La cocina no tiene nada esperando. Aquí te avisamos cuando algo salga.</p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {salon.paraServir.map((r) =>
                    r.canal === 'mesa' ? (
                      <li key={r.id} className="aparecer rounded-2xl border-2 border-tinta bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <b>
                            Mesa {r.mesa.numero} · ronda {r.mesa.ronda}
                          </b>
                          <span className="text-xs text-tinta-soft">lista hace {minutosDesde(r.actualizadoEn)} min</span>
                        </div>
                        <p className="text-sm">{r.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', ')}</p>
                        <button className="btn btn-turquesa btn-sm mt-2 w-full" disabled={sirviendo === r.id} onClick={() => void servir(r.id)}>
                          <Check size={16} strokeWidth={3} aria-hidden /> Ya lo serví
                        </button>
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
            </section>

            <section className="sticker p-4 text-tinta" aria-labelledby="t-mis-mesas">
              <h2 id="t-mis-mesas" className="mb-1 font-black uppercase">
                Mis mesas
              </h2>
              {misMesas.length === 0 ? (
                <p className="text-sm text-tinta-soft">No tienes mesas abiertas. Toca una mesa libre en el plano para abrirla.</p>
              ) : (
                <ul className="divide-y divide-crema-300">
                  {misMesas.map((m) => (
                    <li key={m.id}>
                      <button className="flex min-h-14 w-full items-center gap-3 py-2 text-left" onClick={() => router.push(`/mesero/cuenta/${m.cuenta!.id}`)}>
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-tinta font-black ${ESTILO_MESA[m.estado].replace('animate-latido', '')}`}>{m.numero}</span>
                        <span className="min-w-0 flex-1 text-sm">
                          <b className="block">Mesa {m.numero}</b>
                          <span className="text-xs text-tinta-soft">
                            {m.cuenta!.comensales} {m.cuenta!.comensales === 1 ? 'persona' : 'personas'} · hace {minutosDesde(m.cuenta!.abiertaEn)} min
                            {m.cuenta!.cuentaPedidaEn ? ' · pidió la cuenta' : ''}
                          </span>
                        </span>
                        <span className="text-sm font-extrabold tabular-nums">{cop(m.cuenta!.subtotal)}</span>
                        <ChevronRight size={16} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          <section className="grid gap-5 lg:order-1" aria-label="Plano del salón">
            {salon.mesas.length === 0 && <p className="rounded-2xl border-2 border-dashed border-noche-700 p-8 text-center text-noche-300">Esta sede todavía no tiene mesas. El administrador las crea en Administración › Sedes.</p>}
            {[...zonas.entries()].map(([zona, mesas]) => (
              <div key={zona}>
                <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-noche-300">{zona}</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
                  {mesas.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => (m.cuenta ? router.push(`/mesero/cuenta/${m.cuenta.id}`) : setAbrir(m))}
                      className={`grid min-h-28 content-between rounded-2xl border-2 border-tinta p-3 text-left shadow-sticker-sm transition active:scale-[0.97] ${ESTILO_MESA[m.estado]}`}
                    >
                      <span className="flex items-start justify-between">
                        <span className="text-3xl font-black leading-none">
                          <span className="sr-only">Mesa </span>
                          {m.numero}
                        </span>
                        <span className="flex items-center gap-0.5 text-xs font-bold opacity-80">
                          <Users size={12} aria-hidden /> {m.cuenta ? m.cuenta.comensales : m.puestos}
                          <span className="sr-only">{m.cuenta ? ' personas' : ' puestos'}</span>
                        </span>
                      </span>
                      {m.cuenta ? (
                        <span className="text-xs font-bold leading-tight">
                          <span className="sr-only">{NOMBRE_ESTADO_MESA[m.estado]}: </span>
                          <span className="block tabular-nums">{cop(m.cuenta.subtotal)}</span>
                          <span className="block opacity-80">{minutosDesde(m.cuenta.abiertaEn)} min</span>
                        </span>
                      ) : (
                        <span className="text-xs font-bold opacity-70">Libre</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <LeyendaMesas />
          </section>
        </div>
      )}

      <Hoja abierta={!!abrir} onCerrar={() => setAbrir(null)} titulo={`Abrir mesa ${abrir?.numero ?? ''}`} ancho="max-w-sm">
        {abrir && sedeId && (
          <AbrirMesa
            mesa={abrir}
            sedeId={sedeId}
            onAbierta={(c) => {
              setAbrir(null)
              router.push(`/mesero/cuenta/${c.id}`)
            }}
          />
        )}
      </Hoja>
    </div>
  )
}

function AbrirMesa({ mesa, sedeId, onAbierta }: { mesa: MesaSalonDTO; sedeId: string; onAbierta: (c: CuentaMesaDTO) => void }) {
  const [personas, setPersonas] = useState(Math.min(2, mesa.puestos))
  const [enviando, setEnviando] = useState(false)
  return (
    <div className="grid justify-items-center gap-4 py-2">
      <p className="text-sm font-semibold text-tinta-soft">¿Cuántas personas se sientan?</p>
      <Contador valor={personas} min={1} max={30} onCambio={setPersonas} etiqueta="Personas en la mesa" />
      <p className="text-xs text-tinta-soft">
        Mesa de {mesa.puestos} puestos{mesa.zona ? ` · ${mesa.zona}` : ''}
      </p>
      <button
        className="btn btn-rosa btn-lg w-full"
        disabled={enviando}
        onClick={async () => {
          setEnviando(true)
          try {
            const r = await api<{ cuenta: CuentaMesaDTO }>(`/mesas/${sedeId}/cuentas`, { metodo: 'POST', cuerpo: { mesaId: mesa.id, comensales: personas } })
            avisar(`Mesa ${mesa.numero} abierta a las ${hora(r.cuenta.abiertaEn)}`)
            onAbierta(r.cuenta)
          } catch (e) {
            avisar(e instanceof ErrorApi ? e.message : 'No se pudo abrir la mesa', 'error')
          } finally {
            setEnviando(false)
          }
        }}
      >
        Abrir y tomar el pedido
      </button>
    </div>
  )
}

/** Contador grande para el dedo (personas, cantidades). */
export function Contador({ valor, min = 1, max = 20, onCambio, etiqueta, oscuro = false }: { valor: number; min?: number; max?: number; onCambio: (n: number) => void; etiqueta: string; oscuro?: boolean }) {
  const boton = `grid h-11 w-11 place-items-center rounded-full border-2 border-tinta shadow-sticker-sm disabled:opacity-40 ${oscuro ? 'bg-noche-700 text-white' : 'bg-white text-tinta'}`
  return (
    <div className="flex items-center gap-3" role="group" aria-label={etiqueta}>
      <button type="button" className={boton} disabled={valor <= min} onClick={() => onCambio(Math.max(min, valor - 1))} aria-label="Quitar uno">
        <Minus size={18} strokeWidth={3} aria-hidden />
      </button>
      <span className="min-w-8 text-center text-2xl font-black tabular-nums" aria-live="polite">
        {valor}
      </span>
      <button type="button" className={boton} disabled={valor >= max} onClick={() => onCambio(Math.min(max, valor + 1))} aria-label="Agregar uno">
        <Plus size={18} strokeWidth={3} aria-hidden />
      </button>
    </div>
  )
}

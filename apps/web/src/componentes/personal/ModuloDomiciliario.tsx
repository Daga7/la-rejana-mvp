'use client'

import { cop, enlaceGoogleMaps, enlaceWaze, telefonoLegible, type PedidoDTO, type PlanRutaDTO, type Punto } from '@rejana/shared'
import { Check, ChefHat, Loader2, MapPinned, Navigation, Phone, Route, Satellite, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { EstadoChip } from '@/componentes/cliente/EstadoChip'
import { api, ErrorApi, obtener } from '@/lib/api'
import { useTiempoReal } from '@/lib/tiempo-real'

interface Datos {
  pedidos: PedidoDTO[]
  recorrido: { id: string; ordenParadas: string[]; iniciadoEn: string } | null
  sede: { id: string; nombre: string; lat: number; lng: number; limiteMinutosEntrega: number } | null
}

export function ModuloDomiciliario() {
  const { data, mutate, isLoading } = useSWR<Datos>('/domiciliario/pedidos', obtener, { refreshInterval: 30_000 })
  const { conectado, emitir } = useTiempoReal({ activo: true }, { 'pedido:actualizado': () => void mutate() })

  if (isLoading || !data) {
    return (
      <div className="grid gap-3" aria-busy>
        <div className="esqueleto h-24" />
        <div className="esqueleto h-24" />
      </div>
    )
  }
  return data.recorrido ? (
    <Recorrido datos={data} emitir={emitir} conectado={conectado} recargar={() => void mutate()} />
  ) : (
    <Lista datos={data} recargar={() => void mutate()} conectado={conectado} />
  )
}

function Lista({ datos, recargar, conectado }: { datos: Datos; recargar: () => void; conectado: boolean }) {
  const listos = datos.pedidos.filter((p) => p.estado === 'listo')
  const enCocina = datos.pedidos.filter((p) => p.estado === 'recibido' || p.estado === 'en_preparacion')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<PlanRutaDTO | null>(null)
  const [cargando, setCargando] = useState(false)
  const elegidos = listos.filter((p) => seleccion.has(p.id))

  async function planear() {
    setCargando(true)
    try {
      setPlan(await api<PlanRutaDTO>('/domiciliario/ruta', { metodo: 'POST', cuerpo: { pedidoIds: elegidos.map((p) => p.id) } }))
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo planear la ruta', 'error')
    } finally {
      setCargando(false)
    }
  }

  async function salir(pedidoIds: string[]) {
    setCargando(true)
    try {
      await api('/domiciliario/recorridos', { metodo: 'POST', cuerpo: { pedidoIds } })
      avisar('¡A rodar! Los clientes ya pueden seguirte en el mapa')
      setPlan(null)
      setSeleccion(new Set())
      recargar()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo iniciar el recorrido', 'error')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="acento text-lg">Sede {datos.sede?.nombre}</p>
          <h1 className="titulo text-3xl">Tus domicilios</h1>
        </div>
        <span className={`chip ${conectado ? 'bg-turquesa-100 text-turquesa-600' : 'bg-white/10 text-noche-300'}`}>{conectado ? '● En vivo' : '○ Sin conexión'}</span>
      </div>

      <section aria-labelledby="t-listos">
        <h2 id="t-listos" className="mb-2 text-sm font-black uppercase tracking-wider text-amarillo">
          Listos para salir ({listos.length})
        </h2>
        {listos.length === 0 ? (
          <div className="sticker flex items-center gap-4 p-5 text-tinta">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/sticker-domiciliario-fijo.webp" alt="" width={72} height={72} />
            <p className="text-sm">Aún no hay pedidos listos asignados a ti. Te avisamos aquí en cuanto la caja te asigne uno.</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {listos.map((p) => {
              const marcado = seleccion.has(p.id)
              return (
                <li key={p.id}>
                  <label className={`sticker flex cursor-pointer items-start gap-3 p-4 text-tinta transition ${marcado ? 'outline outline-3 outline-rosa' : ''}`}>
                    <input
                      type="checkbox"
                      className="mt-1 h-6 w-6 shrink-0 accent-rosa"
                      checked={marcado}
                      onChange={() =>
                        setSeleccion((s) => {
                          const n = new Set(s)
                          if (n.has(p.id)) n.delete(p.id)
                          else n.add(p.id)
                          return n
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-black">
                        #{p.numero} · {p.barrio ?? p.direccion}
                      </p>
                      <p className="truncate text-sm text-tinta-soft">{p.direccion}</p>
                      <p className="mt-1 text-xs text-tinta-soft">
                        {p.items.reduce((s, i) => s + i.cantidad, 0)} productos · {p.metodoPago === 'efectivo' ? `Cobrar ${cop(p.total)}` : 'Pago con QR'}
                      </p>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {enCocina.length > 0 && (
        <section aria-labelledby="t-cocina">
          <h2 id="t-cocina" className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-noche-300">
            <ChefHat size={16} aria-hidden /> Todavía en cocina ({enCocina.length})
          </h2>
          <ul className="grid gap-2">
            {enCocina.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-2xl border-2 border-noche-700 px-4 py-3 text-sm">
                <span className="font-bold">
                  #{p.numero} · {p.barrio ?? p.direccion}
                </span>
                <EstadoChip estado={p.estado} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <AnimatePresence>
        {elegidos.length > 0 && (
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-3xl">
            <button className="btn btn-rosa btn-lg w-full" onClick={() => void planear()} disabled={cargando}>
              {cargando ? <Loader2 size={18} className="animate-spin" /> : <Route size={18} aria-hidden />} Planear ruta con {elegidos.length} {elegidos.length === 1 ? 'pedido' : 'pedidos'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Hoja abierta={!!plan} onCerrar={() => setPlan(null)} titulo={plan?.dividir ? 'Mejor en varias salidas' : 'Ruta sugerida'}>
        {plan && (
          <div className="grid gap-4">
            <p className={`rounded-xl p-3 text-sm ${plan.dividir ? 'bg-naranja-100' : 'bg-turquesa-100'}`}>{plan.mensaje}</p>
            {plan.salidas.map((s, i) => (
              <div key={i} className="rounded-2xl border-2 border-tinta bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="font-black">{plan.salidas.length > 1 ? `Salida ${i + 1}` : 'Recorrido'}</p>
                  <span className={`chip ${s.cumpleLimite ? 'bg-turquesa-100 text-turquesa-600' : 'bg-rojo-100 text-rojo-600'}`}>
                    ~{s.minutosTotales} min {s.cumpleLimite ? '' : '· excede'}
                  </span>
                </div>
                <ol className="mt-3 grid gap-2">
                  {s.paradas.map((p, k) => (
                    <li key={p.pedidoId} className="flex items-center gap-3 text-sm">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-tinta bg-amarillo text-xs font-black">{k + 1}</span>
                      <span className="min-w-0 flex-1 truncate">
                        #{p.numero} · {p.direccion}
                      </span>
                      <span className={`shrink-0 tabular-nums ${p.excedeLimite ? 'font-bold text-rojo-600' : 'text-tinta-soft'}`}>{p.minutosLlegada} min</span>
                    </li>
                  ))}
                </ol>
                <button className="btn btn-rosa mt-4 w-full" disabled={cargando} onClick={() => void salir(s.paradas.map((p) => p.pedidoId))}>
                  <Navigation size={18} aria-hidden /> {plan.salidas.length > 1 ? `Salir con la salida ${i + 1}` : 'Iniciar recorrido'}
                </button>
              </div>
            ))}
            <p className="text-xs text-tinta-soft">Tiempos estimados desde la sede, con {plan.limiteMinutos} min como máximo para que la comida llegue caliente.</p>
          </div>
        )}
      </Hoja>
    </div>
  )
}

type EmitirFn = <T>(evento: string, datos: unknown, ms?: number) => Promise<T | null>

function Recorrido({ datos, emitir, conectado, recargar }: { datos: Datos; emitir: EmitirFn; conectado: boolean; recargar: () => void }) {
  const orden = datos.recorrido!.ordenParadas
  const paradas = datos.pedidos.filter((p) => p.estado === 'en_camino').sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id))
  const siguiente = paradas[0]
  const [posicion, setPosicion] = useState<Punto | null>(null)
  const [errorGps, setErrorGps] = useState<string | null>(null)
  const [ultimoEnvio, setUltimoEnvio] = useState<number | null>(null)
  const [entregando, setEntregando] = useState<PedidoDTO | null>(null)
  const ultimo = useRef(0)
  const refEmitir = useRef(emitir)
  useEffect(() => {
    refEmitir.current = emitir
  })

  // Comparte la ubicación mientras dure el recorrido (cada 5 s como máximo).
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setErrorGps('Este dispositivo no tiene GPS disponible.'))
      return
    }
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: Math.min(pos.coords.accuracy, 10_000) }
        setPosicion(p)
        setErrorGps(null)
        if (Date.now() - ultimo.current < 5000) return
        ultimo.current = Date.now()
        const r = await refEmitir.current<{ ok: boolean }>('ubicacion', p)
        if (!r?.ok) await api('/domiciliario/ubicacion', { metodo: 'POST', cuerpo: p }).catch(() => {})
        setUltimoEnvio(Date.now())
      },
      (e) => setErrorGps(e.code === e.PERMISSION_DENIED ? 'Activa el permiso de ubicación para que los clientes te puedan seguir.' : 'No logramos leer el GPS. Revisa que esté activo.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Mantiene la pantalla encendida durante el recorrido (si el navegador lo permite).
  useEffect(() => {
    let candado: WakeLockSentinel | null = null
    const pedir = () => {
      if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
        navigator.wakeLock
          .request('screen')
          .then((c) => (candado = c))
          .catch(() => {})
      }
    }
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => {
      document.removeEventListener('visibilitychange', pedir)
      void candado?.release().catch(() => {})
    }
  }, [])

  const origen = posicion ?? (datos.sede ? { lat: datos.sede.lat, lng: datos.sede.lng } : null)

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="titulo text-3xl">En recorrido</h1>
        <span className={`chip ${errorGps ? 'bg-rojo-100 text-rojo-600' : 'bg-turquesa-100 text-turquesa-600'}`}>
          <Satellite size={13} aria-hidden /> {errorGps ? 'Sin GPS' : ultimoEnvio ? `Compartiendo · ${conectado ? 'en vivo' : 'respaldo'}` : 'Buscando GPS…'}
        </span>
      </div>
      {errorGps && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-tinta bg-amarillo p-3 text-sm font-semibold text-tinta">
          <TriangleAlert size={18} className="shrink-0" aria-hidden /> {errorGps}
        </p>
      )}

      {siguiente ? (
        <section className="sticker p-5 text-tinta" aria-labelledby="t-siguiente">
          <p className="text-xs font-black uppercase tracking-wider text-rosa-600">Siguiente entrega · {paradas.length === 1 ? 'la última' : `1 de ${paradas.length}`}</p>
          <h2 id="t-siguiente" className="mt-1 text-2xl font-black leading-tight">
            {siguiente.direccion}
          </h2>
          {siguiente.direccionDetalle && <p className="font-bold">{siguiente.direccionDetalle}</p>}
          <p className="mt-1 text-sm text-tinta-soft">
            #{siguiente.numero} · {siguiente.contactoNombre} {siguiente.barrio ? `· ${siguiente.barrio}` : ''}
          </p>
          {siguiente.notas && <p className="mt-2 rounded-xl bg-amarillo-100 p-2 text-sm">📝 {siguiente.notas}</p>}
          <p className="mt-3 rounded-xl bg-crema-200 p-3 text-sm font-bold">
            {siguiente.estadoPago === 'pagado'
              ? 'Ya está pagado: no cobres.'
              : siguiente.metodoPago === 'efectivo'
                ? `Cobrar ${cop(siguiente.total)}${siguiente.pagaCon ? ` · paga con ${cop(siguiente.pagaCon)}, lleva ${cop(siguiente.pagaCon - siguiente.total)} de cambio` : ''}`
                : `Pago con QR: verifica el comprobante por ${cop(siguiente.total)}`}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a href={origen ? enlaceGoogleMaps(origen, paradas) : '#'} target="_blank" rel="noopener noreferrer" className="btn btn-blanco">
              <MapPinned size={18} aria-hidden /> Google Maps
            </a>
            <a href={enlaceWaze(siguiente)} target="_blank" rel="noopener noreferrer" className="btn btn-blanco">
              <Navigation size={18} aria-hidden /> Waze
            </a>
            <a href={`tel:${siguiente.contactoTelefono}`} className="btn btn-blanco">
              <Phone size={18} aria-hidden /> {telefonoLegible(siguiente.contactoTelefono)}
            </a>
            <button className="btn btn-turquesa" onClick={() => setEntregando(siguiente)}>
              <Check size={18} aria-hidden /> Entregado
            </button>
          </div>
        </section>
      ) : (
        <section className="sticker p-6 text-center text-tinta">
          <p className="text-xl font-black">¡Recorrido terminado!</p>
          <button
            className="btn btn-rosa mt-4"
            onClick={async () => {
              await api('/domiciliario/recorridos/finalizar', { metodo: 'POST' }).catch(() => {})
              recargar()
            }}
          >
            Volver a la lista
          </button>
        </section>
      )}

      {paradas.length > 1 && (
        <section aria-labelledby="t-despues">
          <h2 id="t-despues" className="mb-2 text-sm font-black uppercase tracking-wider text-noche-300">
            Después
          </h2>
          <ol className="grid gap-2">
            {paradas.slice(1).map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border-2 border-noche-700 px-4 py-3 text-sm">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-noche-700 text-xs font-black">{i + 2}</span>
                <span className="min-w-0 flex-1 truncate">
                  #{p.numero} · {p.direccion}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Hoja abierta={!!entregando} onCerrar={() => setEntregando(null)} titulo={`¿Entregaste el #${entregando?.numero ?? ''}?`}>
        {entregando && <ConfirmarEntrega pedido={entregando} onListo={() => {
          setEntregando(null)
          recargar()
        }} />}
      </Hoja>
    </div>
  )
}

function ConfirmarEntrega({ pedido, onListo }: { pedido: PedidoDTO; onListo: () => void }) {
  const [enviando, setEnviando] = useState(false)
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        {pedido.contactoNombre} · {pedido.direccion}
      </p>
      {pedido.estadoPago !== 'pagado' && pedido.metodoPago === 'efectivo' && <p className="rounded-xl bg-amarillo-100 p-3 font-bold">Recuerda recibir {cop(pedido.total)} en efectivo.</p>}
      <button
        className="btn btn-turquesa btn-lg"
        disabled={enviando}
        onClick={async () => {
          setEnviando(true)
          try {
            await api(`/pedidos/${pedido.id}/entregar`, { metodo: 'POST' })
            avisar(`#${pedido.numero} entregado 🎉`)
            onListo()
          } catch (e) {
            avisar(e instanceof ErrorApi ? e.message : 'No se pudo marcar', 'error')
          } finally {
            setEnviando(false)
          }
        }}
      >
        {enviando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} aria-hidden />} Sí, lo entregué
      </button>
    </div>
  )
}

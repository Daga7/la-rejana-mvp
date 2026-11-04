'use client'

import {
  cop,
  crearPedidoSchema,
  distanciaKm,
  numero,
  telefonoLegible,
  type MetodoPago,
  type PedidoCreadoDTO,
  type Punto,
  type SedePublicaDTO,
  type UsuarioDTO,
} from '@rejana/shared'
import { Banknote, Crosshair, Loader2, MapPin, QrCode, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { AlertaError, Campo, MensajeCampo, type Errores } from '@/componentes/Formulario'
import { MapaEntrega } from '@/componentes/mapa'
import { api, ErrorApi, obtener } from '@/lib/api'
import { subtotal, useCarrito } from '@/lib/carrito'
import { guardarCredencial } from '@/lib/pedidos-invitado'
import { useSesion } from '@/lib/sesion'
import { useHidratado } from './MarcoCliente'

interface DireccionGuardada {
  id: string
  etiqueta: string
  direccion: string
  detalle: string | null
  barrio: string | null
  lat: number
  lng: number
}

export function Checkout() {
  const hidratado = useHidratado()
  const { usuario, cargando } = useSesion()
  const { sedeId, items } = useCarrito()
  const { data: sedes } = useSWR<{ sedes: SedePublicaDTO[] }>('/sedes', obtener)
  const { data: dirs, isLoading: cargandoDirs } = useSWR<{ direcciones: DireccionGuardada[] }>(usuario ? '/cuenta/direcciones' : null, obtener)
  const sede = sedes?.sedes.find((s) => s.id === sedeId)

  if (!hidratado || cargando || !sedes || (usuario && cargandoDirs)) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4 pt-6">
        <div className="esqueleto h-10 w-1/2" />
        <div className="esqueleto h-72" />
        <div className="esqueleto h-48" />
      </div>
    )
  }
  if (items.length === 0 || !sede) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-bold">No hay nada para pagar todavía.</p>
        <Link href="/menu" className="btn btn-amarillo mt-4">
          Ir al menú
        </Link>
      </div>
    )
  }
  return <Formulario sede={sede} usuario={usuario} direcciones={dirs?.direcciones ?? []} />
}

function Formulario({ sede, usuario, direcciones }: { sede: SedePublicaDTO; usuario: UsuarioDTO | null; direcciones: DireccionGuardada[] }) {
  const router = useRouter()
  const { items, vaciar, nuevaClaveCheckout } = useCarrito()
  const primera = direcciones[0]
  const [punto, setPunto] = useState<Punto>(primera ? { lat: primera.lat, lng: primera.lng } : { lat: sede.lat + 0.004, lng: sede.lng + 0.002 })
  const [puntoElegido, setPuntoElegido] = useState(!!primera)
  const [direccion, setDireccion] = useState(primera?.direccion ?? '')
  const [detalle, setDetalle] = useState(primera?.detalle ?? '')
  const [barrio, setBarrio] = useState(primera?.barrio ?? '')
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [telefono, setTelefono] = useState(usuario?.telefono ? telefonoLegible(usuario.telefono) : '')
  const [notas, setNotas] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [pagaCon, setPagaCon] = useState<number | null>(null)
  const [acepta, setAcepta] = useState(false)
  const [guardar, setGuardar] = useState(direcciones.length === 0)
  const [errores, setErrores] = useState<Errores>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<{ etiqueta: string; lat: number; lng: number }[]>([])
  const [ubicando, setUbicando] = useState(false)

  const sub = subtotal(items)
  const total = sub + sede.tarifaDomicilio
  const km = distanciaKm(sede, punto)
  const fuera = km > sede.radioEntregaKm

  function moverPunto(p: Punto) {
    setPunto(p)
    setPuntoElegido(true)
    if (!direccion) {
      api<{ direccion: string | null }>(`/geo/inverso?lat=${p.lat}&lng=${p.lng}`)
        .then((r) => {
          if (r.direccion) setDireccion((actual) => actual || r.direccion!)
        })
        .catch(() => {})
    }
  }

  function usarUbicacion() {
    if (!('geolocation' in navigator)) return avisar('Tu dispositivo no comparte ubicación', 'error')
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicando(false)
        moverPunto({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setUbicando(false)
        avisar('No pudimos obtener tu ubicación. Mueve el pin en el mapa.', 'error')
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  async function buscar() {
    if (consulta.trim().length < 3) return
    setBuscando(true)
    try {
      const r = await api<{ resultados: { etiqueta: string; lat: number; lng: number }[] }>(`/geo/buscar?${new URLSearchParams({ q: consulta, lat: String(sede.lat), lng: String(sede.lng) })}`)
      setResultados(r.resultados)
      if (r.resultados.length === 0) avisar('No encontramos esa dirección. Ubica el pin en el mapa.', 'info')
    } catch {
      avisar('El buscador no respondió. Ubica el pin en el mapa.', 'error')
    } finally {
      setBuscando(false)
    }
  }

  async function confirmar(ev: React.FormEvent) {
    ev.preventDefault()
    setGeneral(null)
    const cuerpo = {
      sedeId: sede.id,
      items: items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad, notas: i.notas || undefined })),
      contacto: { nombre, telefono },
      entrega: { direccion, detalle: detalle || undefined, barrio: barrio || undefined, lat: punto.lat, lng: punto.lng },
      notas: notas || undefined,
      metodoPago: metodo,
      pagaCon: metodo === 'efectivo' && pagaCon ? pagaCon : undefined,
      guardarDireccion: usuario ? guardar : undefined,
      aceptaPrivacidad: usuario ? undefined : acepta,
    }
    const r = crearPedidoSchema.safeParse(cuerpo)
    const nuevos: Errores = {}
    if (!r.success) for (const i of r.error.issues) nuevos[String(i.path.at(-1))] ??= i.message
    if (!usuario && !acepta) nuevos.aceptaPrivacidad = 'Debes autorizar el tratamiento de tus datos para el pedido'
    if (!puntoElegido) nuevos.mapa = 'Ubica el punto de entrega en el mapa (o usa tu ubicación)'
    if (fuera) nuevos.mapa = `Esa ubicación está a ${numero(Math.round(km * 10) / 10)} km; llegamos hasta ${numero(sede.radioEntregaKm)} km.`
    if (metodo === 'efectivo' && pagaCon && pagaCon < total) nuevos.pagaCon = 'Debe cubrir el total del pedido'
    setErrores(nuevos)
    if (Object.keys(nuevos).length || !r.success) {
      setGeneral('Revisa los datos marcados')
      return
    }
    setEnviando(true)
    try {
      const res = await api<PedidoCreadoDTO>('/pedidos', { metodo: 'POST', cuerpo: r.data, cabeceras: { 'idempotency-key': nuevaClaveCheckout() } })
      if (res.tokenSeguimiento) guardarCredencial(res.pedido.id, res.tokenSeguimiento)
      vaciar()
      router.replace(`/pedido/${res.pedido.id}?nuevo=1`)
    } catch (e) {
      if (e instanceof ErrorApi) {
        if (e.codigo === 'SIN_CONEXION' || e.status === 502) setGeneral('Sin conexión. Toca «Confirmar pedido» otra vez: no se duplicará.')
        else setGeneral(e.message)
        if (e.codigo === 'FUERA_DE_COBERTURA') setErrores({ mapa: e.message })
      } else setGeneral('Algo salió mal. Inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={confirmar} noValidate className="mx-auto grid max-w-5xl gap-5 pt-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="grid content-start gap-5">
        <div>
          <p className="acento text-lg">Sede {sede.nombre}</p>
          <h1 className="titulo text-3xl">Confirma tu pedido</h1>
        </div>

        <section className="sticker overflow-hidden text-tinta" aria-labelledby="t-donde">
          <div className="p-5 pb-3">
            <h2 id="t-donde" className="flex items-center gap-2 text-lg font-extrabold">
              <MapPin size={20} aria-hidden /> ¿A dónde lo llevamos?
            </h2>
            {direcciones.length > 0 && (
              <div className="sin-scroll mt-3 flex gap-2 overflow-x-auto">
                {direcciones.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    className="chip shrink-0 border-2 border-tinta bg-white !py-1.5 text-sm"
                    onClick={() => {
                      setPunto({ lat: d.lat, lng: d.lng })
                      setPuntoElegido(true)
                      setDireccion(d.direccion)
                      setDetalle(d.detalle ?? '')
                      setBarrio(d.barrio ?? '')
                    }}
                  >
                    {d.etiqueta}: {d.direccion}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <input
                className="campo"
                placeholder="Busca tu dirección (ej.: Calle 68 # 78-15)"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void buscar()
                  }
                }}
                aria-label="Buscar dirección"
              />
              <button type="button" className="btn btn-blanco shrink-0 !px-3" onClick={() => void buscar()} aria-label="Buscar" disabled={buscando}>
                {buscando ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </button>
            </div>
            {resultados.length > 0 && (
              <ul className="mt-2 grid gap-1 rounded-xl border-2 border-tinta bg-white p-1" role="listbox" aria-label="Resultados">
                {resultados.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-crema-200"
                      onClick={() => {
                        moverPunto({ lat: r.lat, lng: r.lng })
                        setResultados([])
                      }}
                    >
                      {r.etiqueta}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="relative h-72 border-y-2 border-tinta sm:h-80">
            <MapaEntrega punto={punto} onCambiar={moverPunto} sede={sede} radioKm={sede.radioEntregaKm} />
            <button type="button" onClick={usarUbicacion} className="btn btn-blanco btn-sm absolute bottom-3 right-3 z-[500]" disabled={ubicando}>
              {ubicando ? <Loader2 size={16} className="animate-spin" /> : <Crosshair size={16} />} Usar mi ubicación
            </button>
          </div>
          <div className="grid gap-4 p-5">
            <p className={`text-xs ${fuera ? 'font-bold text-rojo-600' : 'text-tinta-soft'}`}>
              {puntoElegido ? `Estás a ${numero(Math.round(km * 10) / 10)} km de la sede (cubrimos ${numero(sede.radioEntregaKm)} km).` : 'Arrastra el pin rosado o toca el mapa en el punto exacto de entrega.'}
            </p>
            <MensajeCampo error={errores.mapa} />
            <Campo etiqueta="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} error={errores.direccion} placeholder="Calle 68 # 78-15" autoComplete="street-address" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Apto, torre, casa (opcional)" value={detalle} onChange={(e) => setDetalle(e.target.value)} error={errores.detalle} />
              <Campo etiqueta="Barrio (opcional)" value={barrio} onChange={(e) => setBarrio(e.target.value)} error={errores.barrio} />
            </div>
            {usuario && (
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-rosa" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} /> Guardar esta dirección
              </label>
            )}
          </div>
        </section>

        <section className="sticker grid gap-4 p-5 text-tinta" aria-labelledby="t-quien">
          <h2 id="t-quien" className="text-lg font-extrabold">
            ¿Quién recibe?
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} autoComplete="name" />
            <Campo etiqueta="Celular" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} error={errores.telefono} autoComplete="tel" placeholder="300 123 4567" />
          </div>
          <label className="block">
            <span className="etiqueta">Notas para el domiciliario (opcional)</span>
            <textarea className="campo min-h-20" maxLength={300} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: el timbre no sirve, llamar al llegar" />
          </label>
        </section>
      </div>

      <aside className="grid content-start gap-5 lg:sticky lg:top-24">
        <section className="sticker grid gap-3 p-5 text-tinta" aria-labelledby="t-pago">
          <h2 id="t-pago" className="text-lg font-extrabold">
            ¿Cómo pagas?
          </h2>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Método de pago">
            {(
              [
                ['efectivo', 'Efectivo', Banknote],
                ['qr', 'QR', QrCode],
              ] as const
            ).map(([valor, texto, Icono]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={metodo === valor}
                onClick={() => setMetodo(valor)}
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 border-tinta p-3 font-bold transition ${metodo === valor ? 'bg-amarillo shadow-sticker-sm' : 'bg-white'}`}
              >
                <Icono size={22} aria-hidden /> {texto}
              </button>
            ))}
          </div>
          {metodo === 'efectivo' ? (
            <div>
              <span className="etiqueta">¿Con cuánto pagas? (para llevarte el cambio)</span>
              <div className="flex flex-wrap gap-2">
                {[null, 50000, 100000].map((v) => (
                  <button key={String(v)} type="button" onClick={() => setPagaCon(v)} className={`chip border-2 border-tinta !px-3 !py-1.5 text-sm ${pagaCon === v ? 'bg-turquesa' : 'bg-white'}`}>
                    {v === null ? 'Exacto' : cop(v)}
                  </button>
                ))}
                <input
                  className="campo !min-h-9 w-36 !py-1 text-sm"
                  inputMode="numeric"
                  placeholder="Otro valor"
                  aria-label="Otro valor"
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, ''))
                    setPagaCon(v > 0 ? v : null)
                  }}
                />
              </div>
              <MensajeCampo error={errores.pagaCon} />
              {pagaCon && pagaCon >= total && <p className="mt-1 text-xs text-tinta-soft">Te llevamos {cop(pagaCon - total)} de cambio.</p>}
            </div>
          ) : (
            <p className="text-sm text-tinta-soft">{sede.qrPagoInstrucciones ?? 'Al confirmar te mostramos el código QR de la sede para que pagues desde tu app del banco.'}</p>
          )}
        </section>

        <section className="sticker grid gap-2 p-5 text-tinta" aria-labelledby="t-resumen">
          <h2 id="t-resumen" className="text-lg font-extrabold">
            Resumen
          </h2>
          <ul className="grid gap-1 text-sm">
            {items.map((i) => (
              <li key={`${i.productoId}|${i.notas}`} className="flex justify-between gap-3">
                <span>
                  {i.cantidad}× {i.nombre}
                  {i.notas && <span className="block text-xs text-tinta-soft">«{i.notas}»</span>}
                </span>
                <span className="tabular-nums">{cop(i.precio * i.cantidad)}</span>
              </li>
            ))}
          </ul>
          <div className="my-1 h-0.5 bg-tinta/10" />
          <div className="flex justify-between text-sm">
            <span>Domicilio</span>
            <span className="tabular-nums">{cop(sede.tarifaDomicilio)}</span>
          </div>
          <div className="flex justify-between text-xl font-black">
            <span>Total</span>
            <span className="tabular-nums">{cop(total)}</span>
          </div>
          {!usuario && (
            <div className="mt-2">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-rosa" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
                <span>
                  Autorizo el tratamiento de mis datos para gestionar este pedido según el{' '}
                  <Link href="/privacidad" target="_blank" className="font-bold text-rosa-600 underline">
                    aviso de privacidad
                  </Link>
                  .
                </span>
              </label>
              <MensajeCampo error={errores.aceptaPrivacidad} />
            </div>
          )}
          <AlertaError mensaje={general} />
          <button type="submit" className="btn btn-rosa btn-lg mt-2 w-full" disabled={enviando} aria-busy={enviando}>
            {enviando && <Loader2 size={18} className="animate-spin" aria-hidden />} Confirmar pedido · {cop(total)}
          </button>
          {!sede.abierta && <p className="text-center text-xs font-bold text-rojo-600">La sede está cerrada en este momento.</p>}
        </section>
      </aside>
    </form>
  )
}

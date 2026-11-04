'use client'

import { cop, FLUJO_PEDIDO, hora, NOMBRE_METODO_PAGO, type EstadoPedido, type PedidoDTO, type SedePublicaDTO, type UbicacionEnVivoDTO } from '@rejana/shared'
import { Bell, BellRing, Check, MessageCircle, Phone, RefreshCw, XCircle } from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { MapaSeguimiento } from '@/componentes/mapa'
import { api, ErrorApi, obtener } from '@/lib/api'
import { tokenDe } from '@/lib/pedidos-invitado'
import { activarPush, esIOSSinInstalar, pushSoportado } from '@/lib/push'
import { useTiempoReal } from '@/lib/tiempo-real'

const PASOS: { estado: EstadoPedido; titulo: string }[] = [
  { estado: 'recibido', titulo: 'Recibido' },
  { estado: 'en_preparacion', titulo: 'En la parrilla' },
  { estado: 'listo', titulo: 'Listo' },
  { estado: 'en_camino', titulo: 'En camino' },
  { estado: 'entregado', titulo: 'Entregado' },
]

const ARTE: Record<EstadoPedido, { src: string; video?: string; alt: string; titulo: string; acento: string }> = {
  recibido: { src: '/estados/eleccion.webp', video: '/estados/eleccion.mp4', alt: 'Personaje celebrando tu elección', titulo: 'Recibimos tu pedido', acento: '¡Buena elección!' },
  en_preparacion: { src: '/estados/preparando.webp', video: '/estados/preparando.mp4', alt: 'Chef preparando tu pedido', titulo: 'En la parrilla', acento: 'Lo estamos preparando' },
  listo: { src: '/estados/preparando.webp', video: '/estados/preparando.mp4', alt: 'Chef empacando tu pedido', titulo: 'Listo para salir', acento: 'Lo estamos empacando' },
  en_camino: { src: '/estados/camino.webp', video: '/estados/camino.mp4', alt: 'Domiciliario en moto', titulo: 'Va en camino', acento: '¡Ya casi llega!' },
  entregado: { src: '/marca/sticker-celebra-fijo.webp', alt: 'Personaje celebrando', titulo: '¡Entregado!', acento: 'Buen provecho' },
  cancelado: { src: '/marca/sticker-clienta-fijo.webp', alt: '', titulo: 'Pedido cancelado', acento: 'Lo sentimos' },
}

function Ilustracion({ estado }: { estado: EstadoPedido }) {
  const reducir = useReducedMotion()
  const arte = ARTE[estado]
  return (
    <AnimatePresence mode="wait">
      <m.div key={estado} initial={{ opacity: 0, scale: 0.9, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="mx-auto w-44 sm:w-52">
        {arte.video && !reducir ? (
          <video src={arte.video} poster={arte.src} autoPlay muted loop playsInline disablePictureInPicture aria-label={arte.alt} className="aspect-square w-full rounded-3xl border-2 border-tinta object-cover shadow-sticker" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={arte.src} alt={arte.alt} width={208} height={208} className="aspect-square w-full rounded-3xl object-cover" />
        )}
      </m.div>
    </AnimatePresence>
  )
}

function Pasos({ estado }: { estado: EstadoPedido }) {
  const actual = FLUJO_PEDIDO.indexOf(estado)
  return (
    <ol className="relative mt-6 grid grid-cols-5 gap-1" aria-label="Avance del pedido">
      <div className="absolute left-[10%] right-[10%] top-4 h-1 rounded-full bg-white/15" aria-hidden />
      <m.div className="absolute left-[10%] top-4 h-1 rounded-full bg-amarillo" initial={false} animate={{ width: `${Math.max(0, actual) * 20}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} aria-hidden />
      {PASOS.map((p, i) => {
        const hecho = i < actual
        const ahora = i === actual
        return (
          <li key={p.estado} className="relative z-10 flex flex-col items-center gap-1.5 text-center" aria-current={ahora ? 'step' : undefined}>
            <m.span
              initial={false}
              animate={{ scale: ahora ? 1.15 : 1 }}
              className={`grid h-9 w-9 place-items-center rounded-full border-2 border-tinta text-sm font-black ${hecho ? 'bg-amarillo text-tinta' : ahora ? 'animate-latido bg-rosa-500 text-white' : 'bg-noche-700 text-noche-300'}`}
            >
              {hecho ? <Check size={16} strokeWidth={3} /> : i + 1}
            </m.span>
            <span className={`text-[11px] font-bold leading-tight sm:text-xs ${ahora ? 'text-white' : 'text-noche-300'}`}>{p.titulo}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function Seguimiento({ id }: { id: string }) {
  const nuevo = useSearchParams().get('nuevo') === '1'
  const [token] = useState(() => (typeof window === 'undefined' ? null : tokenDe(id)))
  const cabeceras = token ? { 'x-pedido-token': token } : undefined
  const { data, error, mutate } = useSWR<{ pedido: PedidoDTO }>(`/pedidos/${id}`, () => api(`/pedidos/${id}`, { cabeceras }), { refreshInterval: 20_000 })
  const { data: sedes } = useSWR<{ sedes: SedePublicaDTO[] }>('/sedes', obtener)
  const pedido = data?.pedido
  const sede = sedes?.sedes.find((s) => s.id === pedido?.sedeId)
  const [ubicacion, setUbicacion] = useState<UbicacionEnVivoDTO | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [pushActivo, setPushActivo] = useState(false)

  const terminado = pedido ? ['entregado', 'cancelado'].includes(pedido.estado) : false
  const { conectado } = useTiempoReal(
    { pedidoId: id, tokenSeguimiento: token, activo: !!pedido && !terminado },
    {
      'pedido:estado': () => void mutate(),
      'pedido:ubicacion': (u: UbicacionEnVivoDTO) => setUbicacion(u),
      'pedido:ubicacion-fin': () => setUbicacion(null),
    },
  )

  useEffect(() => {
    if (nuevo) avisar('¡Pedido confirmado! Te avisamos cada paso')
  }, [nuevo])

  if (error && !pedido) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-bold">{error instanceof ErrorApi && error.status === 404 ? 'No encontramos ese pedido en este dispositivo.' : 'No pudimos cargar el pedido.'}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button className="btn btn-amarillo" onClick={() => void mutate()}>
            <RefreshCw size={16} aria-hidden /> Reintentar
          </button>
          <Link href="/mis-pedidos" className="btn btn-blanco">
            Mis pedidos
          </Link>
        </div>
      </div>
    )
  }
  if (!pedido) {
    return (
      <div className="mx-auto grid max-w-2xl gap-4 pt-6" aria-busy>
        <div className="esqueleto mx-auto h-52 w-52" />
        <div className="esqueleto h-16" />
        <div className="esqueleto h-40" />
      </div>
    )
  }

  const arte = ARTE[pedido.estado]
  const eta = ubicacion?.etaMinutos ?? pedido.etaMinutos
  const whatsapp = sede ? `https://wa.me/${sede.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, escribo por mi pedido #${pedido.numero}`)}` : null

  async function notificarme() {
    try {
      await activarPush(id, token)
      setPushActivo(true)
      avisar('Listo: te avisaremos cuando cambie tu pedido')
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-5 pt-6">
      <section className="sticker !bg-noche-800 p-5 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-noche-300">
          Pedido #{pedido.numero} · Sede {pedido.sedeNombre}
        </p>
        <div className="mt-4">
          <Ilustracion estado={pedido.estado} />
        </div>
        <p className="acento mt-4 text-xl">{arte.acento}</p>
        <h1 className="titulo text-3xl" aria-live="polite">
          {arte.titulo}
        </h1>
        {pedido.estado === 'en_camino' && eta !== null && (
          <m.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-2 text-lg font-black text-amarillo">
            Llega en unos {eta} min
          </m.p>
        )}
        {pedido.estado === 'cancelado' && pedido.motivoCancelacion && <p className="mt-2 text-sm text-noche-300">Motivo: {pedido.motivoCancelacion}</p>}
        {pedido.estado !== 'cancelado' && <Pasos estado={pedido.estado} />}
        {!terminado && (
          <p className="mt-4 text-xs text-noche-300">
            {conectado ? '● En vivo' : '○ Reconectando…'} · Actualizado {hora(pedido.actualizadoEn)}
          </p>
        )}
      </section>

      {pedido.estado === 'en_camino' && sede && (
        <section className="sticker overflow-hidden text-tinta" aria-label="Mapa del domicilio">
          <div className="h-72">
            <MapaSeguimiento destino={pedido} sede={sede} domiciliario={ubicacion ? { lat: ubicacion.lat, lng: ubicacion.lng } : null} />
          </div>
          <p className="border-t-2 border-tinta px-4 py-2 text-sm">
            {ubicacion ? `${pedido.domiciliarioNombre?.split(' ')[0] ?? 'El domiciliario'} va hacia tu dirección.` : 'Esperando la ubicación del domiciliario…'}
          </p>
        </section>
      )}

      {!terminado && pushSoportado() && !pushActivo && (
        <button className="btn btn-turquesa btn-lg w-full" onClick={() => void notificarme()}>
          <Bell size={18} aria-hidden /> {pedido.estado === 'en_camino' ? 'Avísame cuando llegue' : 'Avísame cuando salga mi pedido'}
        </button>
      )}
      {!terminado && pushActivo && (
        <p className="flex items-center justify-center gap-2 text-sm font-bold text-turquesa">
          <BellRing size={16} aria-hidden /> Notificaciones activadas
        </p>
      )}
      {!terminado && !pushSoportado() && esIOSSinInstalar() && <p className="text-center text-xs text-noche-300">En iPhone, agrega la app a tu pantalla de inicio para recibir notificaciones del pedido.</p>}

      {pedido.metodoPago === 'qr' && pedido.estadoPago === 'pendiente' && pedido.estado !== 'cancelado' && sede?.qrPagoUrl && (
        <section className="sticker grid items-center gap-4 p-5 text-tinta sm:grid-cols-[160px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sede.qrPagoUrl} alt={`Código QR de pago de la sede ${sede.nombre}`} width={160} height={180} className="mx-auto w-40 rounded-xl border-2 border-tinta bg-white" />
          <div>
            <h2 className="text-lg font-extrabold">Paga con QR: {cop(pedido.total)}</h2>
            <p className="mt-1 text-sm text-tinta-soft">{sede.qrPagoInstrucciones}</p>
          </div>
        </section>
      )}

      <section className="sticker grid gap-2 p-5 text-tinta" aria-labelledby="t-detalle">
        <h2 id="t-detalle" className="text-lg font-extrabold">
          Tu pedido
        </h2>
        <ul className="grid gap-1 text-sm">
          {pedido.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>
                {i.cantidad}× {i.nombre}
                {i.notas && <span className="block text-xs text-tinta-soft">«{i.notas}»</span>}
              </span>
              <span className="tabular-nums">{cop(i.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="my-1 h-0.5 bg-tinta/10" />
        <div className="flex justify-between text-sm">
          <span>Domicilio</span>
          <span>{cop(pedido.costoEnvio)}</span>
        </div>
        <div className="flex justify-between text-lg font-black">
          <span>Total</span>
          <span>{cop(pedido.total)}</span>
        </div>
        <p className="text-sm text-tinta-soft">
          {NOMBRE_METODO_PAGO[pedido.metodoPago]}
          {pedido.pagaCon ? ` · pagas con ${cop(pedido.pagaCon)} (cambio ${cop(pedido.pagaCon - pedido.total)})` : ''}
          {pedido.estadoPago === 'pagado' ? ' · Pagado ✔' : ''}
        </p>
        <p className="text-sm">
          <b>Entrega:</b> {pedido.direccion}
          {pedido.direccionDetalle ? `, ${pedido.direccionDetalle}` : ''} · {pedido.contactoNombre}
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-blanco">
            <MessageCircle size={18} aria-hidden /> Escribir a la sede
          </a>
        )}
        {sede && (
          <a href={`tel:${sede.telefono}`} className="btn btn-blanco">
            <Phone size={18} aria-hidden /> Llamar a la sede
          </a>
        )}
        {pedido.estado === 'recibido' && (
          <button className="btn btn-fantasma text-noche-300 sm:col-span-2" onClick={() => setCancelando(true)}>
            <XCircle size={18} aria-hidden /> Cancelar pedido
          </button>
        )}
        {terminado && (
          <Link href="/menu" className="btn btn-amarillo sm:col-span-2">
            Volver a pedir
          </Link>
        )}
      </div>

      <HojaCancelar abierta={cancelando} onCerrar={() => setCancelando(false)} id={id} token={token} onListo={() => void mutate()} />
    </div>
  )
}

function HojaCancelar({ abierta, onCerrar, id, token, onListo }: { abierta: boolean; onCerrar: () => void; id: string; token: string | null; onListo: () => void }) {
  const [motivo, setMotivo] = useState('Me equivoqué en el pedido')
  const [enviando, setEnviando] = useState(false)
  return (
    <Hoja abierta={abierta} onCerrar={onCerrar} titulo="¿Cancelar el pedido?">
      <p className="text-sm">Puedes cancelarlo mientras la cocina no haya empezado.</p>
      <fieldset className="mt-4 grid gap-2">
        <legend className="etiqueta">Motivo</legend>
        {['Me equivoqué en el pedido', 'Me equivoqué de dirección', 'Ya no lo necesito', 'Otro motivo'].map((opcion) => (
          <label key={opcion} className="flex items-center gap-3 rounded-xl border-2 border-tinta/20 bg-white px-3 py-2.5 text-sm">
            <input type="radio" name="motivo" className="h-4 w-4 accent-rosa" checked={motivo === opcion} onChange={() => setMotivo(opcion)} /> {opcion}
          </label>
        ))}
      </fieldset>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button className="btn btn-crema" onClick={onCerrar}>
          No, seguir
        </button>
        <button
          className="btn btn-rojo"
          disabled={enviando}
          onClick={async () => {
            setEnviando(true)
            try {
              await api(`/pedidos/${id}/cancelar`, { metodo: 'POST', cuerpo: { motivo }, cabeceras: token ? { 'x-pedido-token': token } : {} })
              avisar('Cancelamos tu pedido')
              onListo()
              onCerrar()
            } catch (e) {
              avisar(e instanceof ErrorApi ? e.message : 'No se pudo cancelar', 'error')
            } finally {
              setEnviando(false)
            }
          }}
        >
          Sí, cancelar
        </button>
      </div>
    </Hoja>
  )
}

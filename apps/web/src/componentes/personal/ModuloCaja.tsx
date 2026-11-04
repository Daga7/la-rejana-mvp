'use client'

import {
  cop,
  hora,
  minutosDesde,
  NOMBRE_ESTADO_MESA,
  NOMBRE_METODO_PAGO,
  telefonoLegible,
  type CuentaMesaDTO,
  type MetodoPago,
  type PedidoDomicilioDTO,
  type PedidoDTO,
  type SalonDTO,
} from '@rejana/shared'
import { Banknote, Bike, Check, ChevronDown, ChevronRight, Lock, Phone, Plus, QrCode, Trash2, UtensilsCrossed, XCircle } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { EstadoChip } from '@/componentes/cliente/EstadoChip'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'
import { useTiempoReal } from '@/lib/tiempo-real'
import { SelectorSede, Transcurrido, useSedeOperacion } from './comunes'
import { ChipRonda, ESTILO_MESA } from './mesero/comunes'

type Pestana = 'mesas' | 'despachar' | 'cocina' | 'camino' | 'cobrar' | 'cerrados'
const esDomicilio = (p: PedidoDTO): p is PedidoDomicilioDTO => p.canal === 'domicilio'
const PESTANAS: { id: Exclude<Pestana, 'mesas'>; titulo: string; filtro: (p: PedidoDomicilioDTO) => boolean }[] = [
  { id: 'despachar', titulo: 'Por despachar', filtro: (p) => p.estado === 'listo' },
  { id: 'cocina', titulo: 'En cocina', filtro: (p) => p.estado === 'recibido' || p.estado === 'en_preparacion' },
  { id: 'camino', titulo: 'En camino', filtro: (p) => p.estado === 'en_camino' },
  { id: 'cobrar', titulo: 'Por cobrar / cerrar', filtro: (p) => p.estado === 'entregado' && !p.cerradoEn },
  { id: 'cerrados', titulo: 'Cerrados y cancelados', filtro: (p) => !!p.cerradoEn || p.estado === 'cancelado' },
]

export function ModuloCaja() {
  const { sedeId, sede } = useSedeOperacion()
  const { data, mutate } = useSWR<{ pedidos: PedidoDTO[] }>(sedeId ? `/operacion/pedidos?sedeId=${sedeId}&cerrados=1` : null, obtener, { refreshInterval: 30_000 })
  const { data: datosSalon, mutate: refrescarSalon } = useSWR<{ salon: SalonDTO }>(sedeId ? `/mesas/${sedeId}/salon` : null, obtener, { refreshInterval: 30_000 })
  const { data: doms } = useSWR<{ domiciliarios: { id: string; nombre: string }[] }>(sedeId ? `/operacion/domiciliarios?sedeId=${sedeId}` : null, obtener)
  const { conectado } = useTiempoReal(
    { activo: !!sedeId },
    {
      'pedido:actualizado': (p: PedidoDTO) => {
        void mutate()
        if (p.canal === 'mesa') void refrescarSalon()
      },
      'cuenta:actualizada': () => {
        void refrescarSalon()
        void mutate()
      },
    },
  )
  const [pestana, setPestana] = useState<Pestana>('despachar')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState<PedidoDomicilioDTO | null>(null)
  const [cancelando, setCancelando] = useState<PedidoDomicilioDTO | null>(null)
  const [cobrandoMesa, setCobrandoMesa] = useState<{ id: string; numero: number } | null>(null)
  const todos = data?.pedidos ?? []
  const pedidos = todos.filter(esDomicilio)
  const mesasAbiertas = (datosSalon?.salon.mesas ?? [])
    .filter((m) => m.cuenta)
    .sort((a, b) => Number(!!b.cuenta!.cuentaPedidaEn) - Number(!!a.cuenta!.cuentaPedidaEn) || a.cuenta!.abiertaEn.localeCompare(b.cuenta!.abiertaEn))
  const porCobrarMesas = mesasAbiertas.filter((m) => m.cuenta!.cuentaPedidaEn).length
  const actual = PESTANAS.find((t) => t.id === pestana)
  const lista = actual ? pedidos.filter(actual.filtro).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)) : []
  // Ventas cerradas: domicilios y mesas (una mesa con varias rondas es una sola atención; la propina no es venta).
  const cerradosHoy = todos.filter((p) => p.cerradoEn && p.estado !== 'cancelado')
  const atenciones = new Set(cerradosHoy.map((p) => (p.canal === 'mesa' ? p.mesa.cuentaId : p.id))).size
  const totalCaja = cerradosHoy.reduce((s, p) => s + p.total, 0)

  async function accion(texto: string, fn: () => Promise<unknown>) {
    try {
      await fn()
      avisar(texto)
      await mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo completar la acción', 'error')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titulo mr-auto text-3xl">
          Caja <span className="acento text-xl normal-case">{sede?.nombre}</span>
        </h1>
        <span className={`chip ${conectado ? 'bg-turquesa-100 text-turquesa-700' : 'bg-white/10 text-noche-300'}`}>{conectado ? '● En vivo' : '○ Reconectando'}</span>
        <SelectorSede />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato titulo="Cerrados (24 h)" valor={String(atenciones)} />
        <Dato titulo="Ventas cerradas" valor={cop(totalCaja)} />
        <Dato titulo="Por cobrar" valor={String(pedidos.filter((p) => p.estado !== 'cancelado' && p.estadoPago === 'pendiente').length + mesasAbiertas.length)} className="col-span-2 sm:col-span-1" />
      </div>
      <div className="sin-scroll -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Etapas">
        <button role="tab" aria-selected={pestana === 'mesas'} onClick={() => setPestana('mesas')} className={`btn btn-sm shrink-0 ${pestana === 'mesas' ? 'btn-amarillo' : 'btn-noche'}`}>
          <UtensilsCrossed size={16} aria-hidden /> Mesas <span className="rounded-full bg-tinta/15 px-2 tabular-nums">{mesasAbiertas.length}</span>
          {porCobrarMesas > 0 && <span className="rounded-full bg-rosa-500 px-2 text-white tabular-nums">{porCobrarMesas} por cobrar</span>}
        </button>
        {PESTANAS.map((t) => {
          const n = pedidos.filter(t.filtro).length
          return (
            <button key={t.id} role="tab" aria-selected={pestana === t.id} onClick={() => setPestana(t.id)} className={`btn btn-sm shrink-0 ${pestana === t.id ? 'btn-amarillo' : 'btn-noche'}`}>
              {t.titulo} <span className="rounded-full bg-tinta/15 px-2 tabular-nums">{n}</span>
            </button>
          )
        })}
      </div>

      {pestana === 'mesas' ? (
        !datosSalon ? (
          <div className="esqueleto h-40" />
        ) : mesasAbiertas.length === 0 ? (
          <p className="py-10 text-center text-noche-300">No hay mesas abiertas.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" role="tabpanel">
            {mesasAbiertas.map((m) => (
              <li key={m.id}>
                <button className="sticker flex w-full items-center gap-3 p-4 text-left text-tinta" onClick={() => setCobrandoMesa({ id: m.cuenta!.id, numero: m.numero })}>
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-tinta text-xl font-black ${ESTILO_MESA[m.estado].replace('animate-latido', '')}`}>{m.numero}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block">
                      Mesa {m.numero}
                      {m.zona ? ` · ${m.zona}` : ''}
                    </b>
                    <span className="block text-xs text-tinta-soft">
                      {NOMBRE_ESTADO_MESA[m.estado]} · {m.cuenta!.comensales} {m.cuenta!.comensales === 1 ? 'persona' : 'personas'} · {minutosDesde(m.cuenta!.abiertaEn)} min
                      {m.cuenta!.meseroNombre ? ` · ${m.cuenta!.meseroNombre}` : ''}
                    </span>
                  </span>
                  <span className="font-black tabular-nums">{cop(m.cuenta!.subtotal)}</span>
                  <ChevronRight size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : !data ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto h-20" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <p className="py-10 text-center text-noche-300">No hay pedidos en esta etapa.</p>
      ) : (
        <ul className="grid gap-3" role="tabpanel">
          <AnimatePresence initial={false}>
            {lista.map((p) => {
              const expandido = abierto === p.id
              return (
                <m.li key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="sticker overflow-hidden text-tinta">
                  <button className="flex w-full flex-wrap items-center gap-2 p-4 text-left" onClick={() => setAbierto(expandido ? null : p.id)} aria-expanded={expandido}>
                    <span className="text-lg font-black">#{p.numero}</span>
                    <EstadoChip estado={p.estado} />
                    <span className={`chip ${p.estadoPago === 'pagado' ? 'bg-verde-100 text-verde-700' : 'bg-amarillo-100 text-amarillo-800'}`}>{p.estadoPago === 'pagado' ? 'Pagado' : 'Por cobrar'}</span>
                    {p.estado !== 'entregado' && p.estado !== 'cancelado' && <Transcurrido desde={p.creadoEn} />}
                    <span className="ml-auto font-black tabular-nums">{cop(p.total)}</span>
                    <ChevronDown size={18} className={`transition ${expandido ? 'rotate-180' : ''}`} aria-hidden />
                    <span className="w-full truncate text-sm text-tinta-soft">
                      {p.contactoNombre} · {p.direccion} · {hora(p.creadoEn)} · {p.metodoPago === 'efectivo' ? 'Efectivo' : 'QR'}
                      {p.domiciliarioNombre ? ` · 🛵 ${p.domiciliarioNombre}` : ''}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {expandido && (
                      <m.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t-2 border-tinta/10">
                        <div className="grid gap-4 p-4 sm:grid-cols-2">
                          <div className="grid gap-1 text-sm">
                            {p.items.map((i) => (
                              <p key={i.id}>
                                {i.cantidad}× {i.nombre} {i.notas && <span className="text-tinta-soft">«{i.notas}»</span>}
                              </p>
                            ))}
                            <p className="mt-2 flex items-center gap-1.5">
                              <Phone size={14} aria-hidden />
                              <a className="underline" href={`tel:${p.contactoTelefono}`}>
                                {telefonoLegible(p.contactoTelefono)}
                              </a>
                            </p>
                            <p>
                              {p.direccion}
                              {p.direccionDetalle ? `, ${p.direccionDetalle}` : ''}
                            </p>
                            {p.pagaCon && <p>Paga con {cop(p.pagaCon)} → cambio {cop(p.pagaCon - p.total)}</p>}
                            {p.motivoCancelacion && <p className="text-rojo-600">Motivo: {p.motivoCancelacion}</p>}
                          </div>
                          <div className="grid content-start gap-2">
                            {['recibido', 'en_preparacion', 'listo'].includes(p.estado) && (
                              <label className="grid gap-1">
                                <span className="etiqueta">Domiciliario</span>
                                <select
                                  className="campo"
                                  value={p.domiciliarioId ?? ''}
                                  onChange={(e) => e.target.value && void accion('Domiciliario asignado', () => api(`/pedidos/${p.id}/asignar`, { metodo: 'POST', cuerpo: { domiciliarioId: e.target.value } }))}
                                >
                                  <option value="">Elegir…</option>
                                  {doms?.domiciliarios.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.nombre}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {p.estado === 'listo' && (
                              <button className="btn btn-turquesa" disabled={!p.domiciliarioId} onClick={() => void accion('Pedido despachado', () => api(`/pedidos/${p.id}/estado`, { metodo: 'PATCH', cuerpo: { estado: 'en_camino' } }))}>
                                <Bike size={18} aria-hidden /> Despachar ahora
                              </button>
                            )}
                            {p.estado === 'en_camino' && (
                              <button className="btn btn-turquesa" onClick={() => void accion('Marcado como entregado', () => api(`/pedidos/${p.id}/entregar`, { metodo: 'POST' }))}>
                                <Check size={18} aria-hidden /> Marcar entregado
                              </button>
                            )}
                            {p.estado !== 'cancelado' && p.estadoPago === 'pendiente' && (
                              <button className="btn btn-amarillo" onClick={() => setCobrando(p)}>
                                <Banknote size={18} aria-hidden /> Registrar pago
                              </button>
                            )}
                            {p.estado === 'entregado' && p.estadoPago === 'pagado' && !p.cerradoEn && (
                              <button className="btn btn-noche" onClick={() => void accion('Pedido cerrado', () => api(`/pedidos/${p.id}/cerrar`, { metodo: 'POST' }))}>
                                <Lock size={18} aria-hidden /> Cerrar pedido
                              </button>
                            )}
                            {!['entregado', 'cancelado'].includes(p.estado) && (
                              <button className="btn btn-fantasma text-rojo-600" onClick={() => setCancelando(p)}>
                                <XCircle size={18} aria-hidden /> Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </m.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}

      <Hoja abierta={!!cobrando} onCerrar={() => setCobrando(null)} titulo={`Cobrar pedido #${cobrando?.numero ?? ''}`}>
        {cobrando && <FormCobro pedido={cobrando} onListo={async () => (setCobrando(null), await mutate())} />}
      </Hoja>
      <Hoja abierta={!!cancelando} onCerrar={() => setCancelando(null)} titulo={`Cancelar pedido #${cancelando?.numero ?? ''}`}>
        {cancelando && <FormCancelar pedido={cancelando} onListo={async () => (setCancelando(null), await mutate())} />}
      </Hoja>
      <Hoja abierta={!!cobrandoMesa} onCerrar={() => setCobrandoMesa(null)} titulo={`Cobrar mesa ${cobrandoMesa?.numero ?? ''}`} ancho="max-w-xl">
        {cobrandoMesa && (
          <CobroMesa
            cuentaId={cobrandoMesa.id}
            onListo={async () => {
              setCobrandoMesa(null)
              await Promise.all([refrescarSalon(), mutate()])
            }}
          />
        )}
      </Hoja>
    </div>
  )
}

function Dato({ titulo, valor, className = '' }: { titulo: string; valor: string; className?: string }) {
  return (
    <div className={`rounded-2xl border-2 border-noche-700 bg-noche-950/40 px-4 py-3 ${className}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-noche-300">{titulo}</p>
      <p className="text-2xl font-black">{valor}</p>
    </div>
  )
}

function FormCobro({ pedido, onListo }: { pedido: PedidoDomicilioDTO; onListo: () => void }) {
  const [metodo, setMetodo] = useState<MetodoPago>(pedido.metodoPago)
  const [recibido, setRecibido] = useState(pedido.pagaCon ? String(pedido.pagaCon) : '')
  const [referencia, setReferencia] = useState('')
  const [enviando, setEnviando] = useState(false)
  const valorRecibido = Number(recibido.replace(/\D/g, '')) || 0
  const cambio = metodo === 'efectivo' && valorRecibido ? valorRecibido - pedido.total : null
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        try {
          await api(`/pedidos/${pedido.id}/pagos`, {
            metodo: 'POST',
            cuerpo: { metodo, monto: pedido.total, recibido: metodo === 'efectivo' && valorRecibido ? valorRecibido : undefined, referencia: metodo === 'qr' && referencia ? referencia : undefined },
          })
          avisar('Pago registrado')
          onListo()
        } catch (err) {
          avisar(err instanceof ErrorApi ? err.message : 'No se pudo registrar el pago', 'error')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <p className="text-3xl font-black">{cop(pedido.total)}</p>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Método">
        {(['efectivo', 'qr'] as const).map((op) => (
          <button key={op} type="button" role="radio" aria-checked={metodo === op} onClick={() => setMetodo(op)} className={`flex items-center justify-center gap-2 rounded-2xl border-2 border-tinta p-3 font-bold ${metodo === op ? 'bg-amarillo' : 'bg-white'}`}>
            {op === 'efectivo' ? <Banknote size={18} /> : <QrCode size={18} />} {NOMBRE_METODO_PAGO[op].split(' ')[0]}
          </button>
        ))}
      </div>
      {metodo === 'efectivo' ? (
        <label className="grid gap-1">
          <span className="etiqueta">Efectivo recibido</span>
          <input className="campo" inputMode="numeric" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder={String(pedido.total)} />
          {cambio !== null && <span className={`text-sm font-bold ${cambio < 0 ? 'text-rojo-600' : ''}`}>{cambio < 0 ? 'No alcanza' : `Cambio: ${cop(cambio)}`}</span>}
        </label>
      ) : (
        <label className="grid gap-1">
          <span className="etiqueta">Referencia del comprobante (opcional)</span>
          <input className="campo" maxLength={80} value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        </label>
      )}
      <button className="btn btn-rosa btn-lg" disabled={enviando || (cambio !== null && cambio < 0)}>
        Registrar pago
      </button>
    </form>
  )
}

function FormCancelar({ pedido, onListo }: { pedido: PedidoDomicilioDTO; onListo: () => void }) {
  const [motivo, setMotivo] = useState('')
  const preparado = pedido.estado === 'listo' || pedido.estado === 'en_camino'
  const [reponer, setReponer] = useState(!preparado)
  const [enviando, setEnviando] = useState(false)
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        try {
          await api(`/pedidos/${pedido.id}/cancelar`, { metodo: 'POST', cuerpo: { motivo, reponerInventario: reponer } })
          avisar('Pedido cancelado')
          onListo()
        } catch (err) {
          avisar(err instanceof ErrorApi ? err.message : 'No se pudo cancelar', 'error')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <label className="grid gap-1">
        <span className="etiqueta">Motivo (lo ve el cliente)</span>
        <input className="campo" required minLength={3} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el cliente no contestó" />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-rosa" checked={reponer} onChange={(e) => setReponer(e.target.checked)} />
        <span>
          Devolver los insumos al inventario
          <span className="block text-xs text-tinta-soft">{preparado ? 'La comida ya se preparó: normalmente no se devuelven.' : 'La comida no se alcanzó a preparar.'}</span>
        </span>
      </label>
      <button className="btn btn-rojo btn-lg" disabled={enviando || motivo.trim().length < 3}>
        Cancelar pedido
      </button>
    </form>
  )
}

interface LineaPago {
  metodo: MetodoPago
  monto: string
  recibido: string
  referencia: string
}

const aPesos = (texto: string) => Number(texto.replace(/\D/g, '')) || 0
const lineaVacia = (metodo: MetodoPago = 'efectivo'): LineaPago => ({ metodo, monto: '', recibido: '', referencia: '' })

/**
 * Cobro de una mesa: revisa que no quede nada sin servir, ofrece la propina voluntaria (sugerida 10 %,
 * siempre preguntando a la mesa) y permite dividir la cuenta en varios pagos.
 */
function CobroMesa({ cuentaId, onListo }: { cuentaId: string; onListo: () => void }) {
  const { data, mutate } = useSWR<{ cuenta: CuentaMesaDTO }>(`/cuentas/${cuentaId}`, obtener)
  const [conPropina, setConPropina] = useState(false)
  const [propinaTexto, setPropinaTexto] = useState('')
  const [pagos, setPagos] = useState<LineaPago[]>([lineaVacia()])
  const [enviando, setEnviando] = useState(false)
  const c = data?.cuenta
  if (!c) return <div className="esqueleto h-64" />
  const cuenta = c

  const sinServir = cuenta.rondas.filter((r) => r.estado === 'recibido' || r.estado === 'en_preparacion' || r.estado === 'listo')
  const sugerida = Math.round((cuenta.subtotal * 0.1) / 100) * 100
  const propina = conPropina ? aPesos(propinaTexto) : 0
  const total = cuenta.subtotal + propina
  // Con un solo pago y sin monto escrito, se cobra el total.
  const montos = pagos.map((p) => (pagos.length === 1 && !p.monto ? total : aPesos(p.monto)))
  const suma = montos.reduce((s, m) => s + m, 0)
  const falta = total - suma
  const efectivoInsuficiente = pagos.some((p, i) => p.metodo === 'efectivo' && p.recibido && aPesos(p.recibido) < montos[i]!)
  const listo = sinServir.length === 0 && cuenta.subtotal > 0 && falta === 0 && montos.every((m) => m > 0) && !efectivoInsuficiente

  const cambiar = (i: number, cambios: Partial<LineaPago>) => setPagos((ps) => ps.map((p, k) => (k === i ? { ...p, ...cambios } : p)))
  /** Lo que falta por repartir sin contar esta fila: es lo que se sugiere escribir en ella. */
  const restante = (i: number) => Math.max(0, total - montos.reduce((s, m, k) => (k === i ? s : s + m), 0))
  /** Cuenta dividida en partes iguales (redondeadas a la centena; la última ajusta la diferencia). */
  const partesIguales = () =>
    setPagos((ps) => {
      const parte = Math.floor(total / ps.length / 100) * 100
      return ps.map((p, k) => ({ ...p, monto: String(k === ps.length - 1 ? total - parte * (ps.length - 1) : parte) }))
    })

  async function cancelarRonda(id: string, ronda: number) {
    if (!window.confirm(`¿Cancelar la ronda ${ronda}? Si la cocina no la ha preparado, los insumos vuelven al inventario.`)) return
    try {
      await api(`/pedidos/${id}/cancelar`, { metodo: 'POST', cuerpo: { motivo: 'Cancelada desde la caja' } })
      avisar('Ronda cancelada')
      await mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo cancelar la ronda', 'error')
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        try {
          await api(`/cuentas/${cuenta.id}/cobrar`, {
            metodo: 'POST',
            cuerpo: {
              propina,
              pagos: pagos.map((p, i) => ({
                metodo: p.metodo,
                monto: montos[i],
                recibido: p.metodo === 'efectivo' && p.recibido ? aPesos(p.recibido) : undefined,
                referencia: p.metodo === 'qr' && p.referencia ? p.referencia : undefined,
              })),
            },
          })
          avisar(`Mesa ${cuenta.mesaNumero} cobrada y libre`)
          onListo()
        } catch (err) {
          avisar(err instanceof ErrorApi ? err.message : 'No se pudo cobrar la mesa', 'error')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <div className="grid gap-2 rounded-2xl border-2 border-tinta/15 bg-white p-3 text-sm">
        {cuenta.rondas.map((r) => (
          <div key={r.id} className={r.estado === 'cancelado' ? 'text-tinta-soft' : ''}>
            <div className="flex items-center justify-between gap-2">
              <b>Ronda {r.mesa.ronda}</b>
              <ChipRonda estado={r.estado} />
            </div>
            <p className={r.estado === 'cancelado' ? 'line-through' : ''}>{r.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', ')}</p>
            {['recibido', 'en_preparacion', 'listo'].includes(r.estado) && (
              <button type="button" className="mt-0.5 text-xs font-bold text-rojo-600 underline" onClick={() => void cancelarRonda(r.id, r.mesa.ronda)}>
                Cancelar esta ronda
              </button>
            )}
          </div>
        ))}
        <p className="flex justify-between border-t-2 border-tinta/10 pt-2 text-base font-black">
          <span>Consumo</span>
          <span className="tabular-nums">{cop(cuenta.subtotal)}</span>
        </p>
      </div>

      {sinServir.length > 0 && (
        <p className="rounded-2xl border-2 border-tinta bg-amarillo-100 p-3 text-sm font-bold" role="alert">
          {sinServir.length === 1 ? 'Hay una ronda sin servir' : `Hay ${sinServir.length} rondas sin servir`}: el mesero debe servirla o puedes cancelarla antes de cobrar.
        </p>
      )}

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-rosa"
          checked={conPropina}
          onChange={(e) => {
            setConPropina(e.target.checked)
            if (e.target.checked && !propinaTexto) setPropinaTexto(String(sugerida))
          }}
        />
        <span>
          La mesa quiere dejar propina
          <span className="block text-xs text-tinta-soft">Es voluntaria: pregúntale a la mesa. Sugerida 10 %: {cop(sugerida)}.</span>
        </span>
      </label>
      {conPropina && (
        <label className="grid gap-1">
          <span className="etiqueta">Propina</span>
          <input className="campo" inputMode="numeric" value={propinaTexto} onChange={(e) => setPropinaTexto(e.target.value)} />
        </label>
      )}

      <div className="grid gap-3">
        {pagos.map((p, i) => (
          <fieldset key={i} className="grid gap-2 rounded-2xl border-2 border-tinta/15 p-3">
            <legend className="px-1 text-xs font-bold uppercase text-tinta-soft">{pagos.length > 1 ? `Pago ${i + 1}` : 'Pago'}</legend>
            <div className="flex gap-2">
              {(['efectivo', 'qr'] as const).map((op) => (
                <button key={op} type="button" aria-pressed={p.metodo === op} onClick={() => cambiar(i, { metodo: op })} className={`btn btn-sm flex-1 ${p.metodo === op ? 'btn-amarillo' : 'btn-blanco'}`}>
                  {op === 'efectivo' ? <Banknote size={16} aria-hidden /> : <QrCode size={16} aria-hidden />} {NOMBRE_METODO_PAGO[op].split(' ')[0]}
                </button>
              ))}
              {pagos.length > 1 && (
                <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-tinta-soft hover:bg-black/5" onClick={() => setPagos((ps) => ps.filter((_, k) => k !== i))} aria-label={`Quitar el pago ${i + 1}`}>
                  <Trash2 size={18} aria-hidden />
                </button>
              )}
            </div>
            <label className="grid gap-1">
              <span className="etiqueta">Monto</span>
              <input className="campo" inputMode="numeric" value={p.monto} onChange={(e) => cambiar(i, { monto: e.target.value })} placeholder={String(pagos.length === 1 ? total : restante(i))} />
            </label>
            {p.metodo === 'efectivo' ? (
              <label className="grid gap-1">
                <span className="etiqueta">Efectivo recibido (opcional)</span>
                <input className="campo" inputMode="numeric" value={p.recibido} onChange={(e) => cambiar(i, { recibido: e.target.value })} />
                {p.recibido && (
                  <span className={`text-sm font-bold ${aPesos(p.recibido) < montos[i]! ? 'text-rojo-600' : ''}`}>
                    {aPesos(p.recibido) < montos[i]! ? 'No alcanza' : `Cambio: ${cop(aPesos(p.recibido) - montos[i]!)}`}
                  </span>
                )}
              </label>
            ) : (
              <label className="grid gap-1">
                <span className="etiqueta">Referencia del comprobante (opcional)</span>
                <input className="campo" maxLength={80} value={p.referencia} onChange={(e) => cambiar(i, { referencia: e.target.value })} />
              </label>
            )}
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          {pagos.length < 6 && (
            <button type="button" className="btn btn-blanco btn-sm" onClick={() => setPagos((ps) => [...ps, lineaVacia(ps.at(-1)?.metodo === 'efectivo' ? 'qr' : 'efectivo')])}>
              <Plus size={16} aria-hidden /> Dividir la cuenta (otro pago)
            </button>
          )}
          {pagos.length > 1 && (
            <button type="button" className="btn btn-blanco btn-sm" onClick={partesIguales}>
              Partes iguales
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-1 rounded-2xl bg-crema-200 p-3 text-sm">
        <p className="flex justify-between">
          <span>Total a pagar{propina ? ' (con propina)' : ''}</span>
          <b className="tabular-nums">{cop(total)}</b>
        </p>
        {pagos.length > 1 && (
          <p className={`flex justify-between font-bold ${falta === 0 ? 'text-verde-700' : 'text-rojo-600'}`}>
            <span>{falta > 0 ? 'Falta por repartir' : falta < 0 ? 'Sobra' : 'Pagos completos'}</span>
            <span className="tabular-nums">{falta === 0 ? <Check size={16} aria-hidden /> : cop(Math.abs(falta))}</span>
          </p>
        )}
      </div>

      <button className="btn btn-rosa btn-lg" disabled={enviando || !listo}>
        <Lock size={18} aria-hidden /> Cobrar y liberar la mesa
      </button>
    </form>
  )
}

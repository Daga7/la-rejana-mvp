'use client'

import { cop, hora, NOMBRE_METODO_PAGO, telefonoLegible, type MetodoPago, type PedidoDTO } from '@rejana/shared'
import { Banknote, Bike, Check, ChevronDown, Lock, Phone, QrCode, XCircle } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { EstadoChip } from '@/componentes/cliente/EstadoChip'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'
import { useTiempoReal } from '@/lib/tiempo-real'
import { SelectorSede, Transcurrido, useSedeOperacion } from './comunes'

type Pestana = 'despachar' | 'cocina' | 'camino' | 'cobrar' | 'cerrados'
const PESTANAS: { id: Pestana; titulo: string; filtro: (p: PedidoDTO) => boolean }[] = [
  { id: 'despachar', titulo: 'Por despachar', filtro: (p) => p.estado === 'listo' },
  { id: 'cocina', titulo: 'En cocina', filtro: (p) => p.estado === 'recibido' || p.estado === 'en_preparacion' },
  { id: 'camino', titulo: 'En camino', filtro: (p) => p.estado === 'en_camino' },
  { id: 'cobrar', titulo: 'Por cobrar / cerrar', filtro: (p) => p.estado === 'entregado' && !p.cerradoEn },
  { id: 'cerrados', titulo: 'Cerrados y cancelados', filtro: (p) => !!p.cerradoEn || p.estado === 'cancelado' },
]

export function ModuloCaja() {
  const { sedeId, sede } = useSedeOperacion()
  const { data, mutate } = useSWR<{ pedidos: PedidoDTO[] }>(sedeId ? `/operacion/pedidos?sedeId=${sedeId}&cerrados=1` : null, obtener, { refreshInterval: 30_000 })
  const { data: doms } = useSWR<{ domiciliarios: { id: string; nombre: string }[] }>(sedeId ? `/operacion/domiciliarios?sedeId=${sedeId}` : null, obtener)
  const { conectado } = useTiempoReal({ activo: !!sedeId }, { 'pedido:actualizado': () => void mutate() })
  const [pestana, setPestana] = useState<Pestana>('despachar')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState<PedidoDTO | null>(null)
  const [cancelando, setCancelando] = useState<PedidoDTO | null>(null)
  const pedidos = data?.pedidos ?? []
  const actual = PESTANAS.find((t) => t.id === pestana)!
  const lista = pedidos.filter(actual.filtro).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
  const cerradosHoy = pedidos.filter((p) => p.cerradoEn)
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
        <span className={`chip ${conectado ? 'bg-turquesa-100 text-turquesa-600' : 'bg-white/10 text-noche-300'}`}>{conectado ? '● En vivo' : '○ Reconectando'}</span>
        <SelectorSede />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato titulo="Cerrados (24 h)" valor={String(cerradosHoy.length)} />
        <Dato titulo="Recaudo cerrado" valor={cop(totalCaja)} />
        <Dato titulo="Por cobrar" valor={String(pedidos.filter((p) => p.estado !== 'cancelado' && p.estadoPago === 'pendiente').length)} className="col-span-2 sm:col-span-1" />
      </div>
      <div className="sin-scroll -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Etapas">
        {PESTANAS.map((t) => {
          const n = pedidos.filter(t.filtro).length
          return (
            <button key={t.id} role="tab" aria-selected={pestana === t.id} onClick={() => setPestana(t.id)} className={`btn btn-sm shrink-0 ${pestana === t.id ? 'btn-amarillo' : 'btn-noche'}`}>
              {t.titulo} <span className="rounded-full bg-tinta/15 px-2 tabular-nums">{n}</span>
            </button>
          )
        })}
      </div>

      {!data ? (
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
                    <span className={`chip ${p.estadoPago === 'pagado' ? 'bg-verde-100 text-verde' : 'bg-amarillo-100 text-amarillo-600'}`}>{p.estadoPago === 'pagado' ? 'Pagado' : 'Por cobrar'}</span>
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

function FormCobro({ pedido, onListo }: { pedido: PedidoDTO; onListo: () => void }) {
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

function FormCancelar({ pedido, onListo }: { pedido: PedidoDTO; onListo: () => void }) {
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

'use client'

import { cantidadInsumo, fechaHora, NOMBRE_UNIDAD, numero, type InventarioItemDTO, type MovimientoInventarioDTO, type Unidad } from '@rejana/shared'
import { CheckCircle2, History, PackagePlus, Plus, Scale, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'
import { SelectorSede, useSedeOperacion } from '../comunes'

interface DatosInventario {
  inventario: InventarioItemDTO[]
  capacidad: { productoId: string; nombre: string; maxUnidades: number | null; disponible: boolean; agotado: boolean }[]
  alertas: number
}

const TIPO: Record<MovimientoInventarioDTO['tipo'], string> = {
  consumo_pedido: 'Pedido',
  reposicion_cancelacion: 'Devolución por cancelación',
  ajuste_manual: 'Conteo físico',
  entrada: 'Entrada',
}

export function InventarioAdmin() {
  const { sedeId, sede } = useSedeOperacion()
  const { data, mutate } = useSWR<DatosInventario>(sedeId ? `/inventario/${sedeId}` : null, obtener)
  const [movimiento, setMovimiento] = useState<{ item: InventarioItemDTO; modo: 'sumar' | 'fijar' } | null>(null)
  const [historial, setHistorial] = useState<InventarioItemDTO | null>(null)
  const [nuevoInsumo, setNuevoInsumo] = useState(false)

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="acento text-lg">Sede {sede?.nombre}</p>
          <h1 className="titulo text-3xl">Inventario</h1>
        </div>
        <SelectorSede />
        <button className="btn btn-amarillo btn-sm" onClick={() => setNuevoInsumo(true)}>
          <Plus size={16} aria-hidden /> Nuevo insumo
        </button>
      </div>
      {!data ? (
        <div className="esqueleto h-96" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1.7fr_1fr]">
          <section className="sticker overflow-x-auto p-4 text-tinta" aria-labelledby="t-insumos">
            <h2 id="t-insumos" className="font-extrabold">
              Insumos {data.alertas > 0 && <span className="chip ml-2 bg-amarillo-100 text-amarillo-800">{data.alertas} bajo el mínimo</span>}
            </h2>
            <table className="tabla tabla-apilable mt-2">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th className="num">Saldo</th>
                  <th className="num">Mínimo</th>
                  <th>Estado</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.inventario.map((i) => (
                  <tr key={i.insumoId}>
                    <td className="font-bold">{i.insumoNombre}</td>
                    <td className="num" data-label="Saldo">
                      {cantidadInsumo(i.cantidad, i.unidad)}
                    </td>
                    <td className="num" data-label="Mínimo">
                      <Minimo item={i} sedeId={sedeId!} onGuardado={() => void mutate()} />
                    </td>
                    <td data-label="Estado">
                      {i.bajo ? (
                        <span className="inline-flex items-center gap-1 text-sm font-bold">
                          <TriangleAlert size={15} style={{ color: '#d99a00' }} aria-hidden /> Bajo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <CheckCircle2 size={15} style={{ color: '#0ca30c' }} aria-hidden /> Bien
                        </span>
                      )}
                    </td>
                    <td data-label="">
                      <div className="flex justify-end gap-1">
                        <button className="btn btn-turquesa btn-sm !min-h-8 !px-2.5" onClick={() => setMovimiento({ item: i, modo: 'sumar' })} aria-label={`Registrar entrada de ${i.insumoNombre}`}>
                          <PackagePlus size={15} aria-hidden /> Entrada
                        </button>
                        <button className="btn btn-blanco btn-sm !min-h-8 !px-2.5" onClick={() => setMovimiento({ item: i, modo: 'fijar' })} aria-label={`Conteo físico de ${i.insumoNombre}`}>
                          <Scale size={15} aria-hidden />
                        </button>
                        <button className="btn btn-blanco btn-sm !min-h-8 !px-2.5" onClick={() => setHistorial(i)} aria-label={`Historial de ${i.insumoNombre}`}>
                          <History size={15} aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="sticker p-4 text-tinta" aria-labelledby="t-capacidad">
            <h2 id="t-capacidad" className="font-extrabold">
              Alcanza para
            </h2>
            <p className="text-xs text-tinta-soft">Unidades que se pueden preparar con el inventario actual (manda el insumo más escaso).</p>
            <ul className="mt-3 grid gap-2">
              {data.capacidad.map((p) => (
                <li key={p.productoId} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                  <span className="font-semibold">{p.nombre}</span>
                  {p.agotado ? (
                    <span className="chip bg-rojo-100 text-rojo-600">{p.disponible ? 'Agotado' : 'Apagado'}</span>
                  ) : (
                    <b className="tabular-nums">{p.maxUnidades === null ? 'Sin receta' : `${numero(p.maxUnidades)} und`}</b>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <Hoja abierta={!!movimiento} onCerrar={() => setMovimiento(null)} titulo={movimiento?.modo === 'sumar' ? `Entrada de ${movimiento.item.insumoNombre}` : `Conteo de ${movimiento?.item.insumoNombre ?? ''}`}>
        {movimiento && sedeId && <FormMovimiento {...movimiento} sedeId={sedeId} onListo={() => (setMovimiento(null), void mutate())} />}
      </Hoja>
      <Hoja abierta={!!historial} onCerrar={() => setHistorial(null)} titulo={`Historial · ${historial?.insumoNombre ?? ''}`} ancho="max-w-2xl">
        {historial && sedeId && <Historial sedeId={sedeId} item={historial} />}
      </Hoja>
      <Hoja abierta={nuevoInsumo} onCerrar={() => setNuevoInsumo(false)} titulo="Nuevo insumo">
        <FormInsumo onListo={() => (setNuevoInsumo(false), void mutate())} />
      </Hoja>
    </div>
  )
}

function Minimo({ item, sedeId, onGuardado }: { item: InventarioItemDTO; sedeId: string; onGuardado: () => void }) {
  const [valor, setValor] = useState(String(item.stockMinimo))
  return (
    <input
      className="campo !min-h-9 !w-24 !px-2 !py-1 text-right text-sm"
      inputMode="decimal"
      aria-label={`Mínimo de ${item.insumoNombre} en ${NOMBRE_UNIDAD[item.unidad]}`}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={async () => {
        const n = Number(valor.replace(',', '.'))
        if (!Number.isFinite(n) || n < 0 || n === item.stockMinimo) return setValor(String(item.stockMinimo))
        try {
          await api('/admin/inventario/minimo', { metodo: 'PUT', cuerpo: { sedeId, insumoId: item.insumoId, stockMinimo: n } })
          avisar('Mínimo actualizado')
          onGuardado()
        } catch (e) {
          avisar(e instanceof ErrorApi ? e.message : 'No se pudo guardar', 'error')
        }
      }}
    />
  )
}

function FormMovimiento({ item, modo, sedeId, onListo }: { item: InventarioItemDTO; modo: 'sumar' | 'fijar'; sedeId: string; onListo: () => void }) {
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const n = Number(cantidad.replace(',', '.'))
  const valido = Number.isFinite(n) && (modo === 'sumar' ? n > 0 : n >= 0) && cantidad !== ''
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        try {
          const r = await api<{ saldo: number }>('/admin/inventario/movimientos', { metodo: 'POST', cuerpo: { sedeId, insumoId: item.insumoId, modo, cantidad: n, nota: nota || undefined } })
          avisar(`Saldo nuevo: ${cantidadInsumo(r.saldo, item.unidad)}`)
          onListo()
        } catch (err) {
          avisar(err instanceof ErrorApi ? err.message : 'No se pudo registrar', 'error')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <p className="text-sm">
        Saldo actual: <b>{cantidadInsumo(item.cantidad, item.unidad)}</b>
      </p>
      <label className="grid gap-1">
        <span className="etiqueta">{modo === 'sumar' ? `Cantidad que entra (${NOMBRE_UNIDAD[item.unidad]})` : `Cantidad contada (${NOMBRE_UNIDAD[item.unidad]})`}</span>
        <input className="campo" inputMode="decimal" autoFocus value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        {modo === 'fijar' && valido && <span className="text-xs text-tinta-soft">Diferencia: {numero(n - item.cantidad)} {item.unidad}</span>}
      </label>
      <label className="grid gap-1">
        <span className="etiqueta">Nota (opcional)</span>
        <input className="campo" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={modo === 'sumar' ? 'Ej.: compra Makro, factura 123' : 'Ej.: conteo de cierre'} />
      </label>
      <button className="btn btn-rosa btn-lg" disabled={!valido || enviando}>
        {modo === 'sumar' ? 'Registrar entrada' : 'Guardar conteo'}
      </button>
    </form>
  )
}

function Historial({ sedeId, item }: { sedeId: string; item: InventarioItemDTO }) {
  const { data } = useSWR<{ movimientos: MovimientoInventarioDTO[] }>(`/inventario/${sedeId}/movimientos?insumoId=${item.insumoId}`, obtener)
  if (!data) return <div className="esqueleto-claro h-40" />
  if (data.movimientos.length === 0) return <p className="text-sm">Sin movimientos.</p>
  return (
    <table className="tabla tabla-apilable">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th className="num">Cantidad</th>
          <th className="num">Saldo</th>
          <th>Detalle</th>
        </tr>
      </thead>
      <tbody>
        {data.movimientos.map((m) => (
          <tr key={m.id}>
            <td>{fechaHora(m.creadoEn)}</td>
            <td data-label="Tipo">{TIPO[m.tipo]}</td>
            <td className="num" data-label="Cantidad">
              {m.cantidad > 0 ? '+' : ''}
              {numero(m.cantidad)} {m.unidad}
            </td>
            <td className="num" data-label="Saldo">
              {cantidadInsumo(m.saldoResultante, m.unidad)}
            </td>
            <td data-label="Detalle" className="text-xs text-tinta-soft">
              {[m.pedidoNumero ? `Pedido #${m.pedidoNumero}` : null, m.usuarioNombre, m.nota].filter(Boolean).join(' · ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FormInsumo({ onListo }: { onListo: () => void }) {
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState<Unidad>('g')
  const [enviando, setEnviando] = useState(false)
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        try {
          await api('/admin/insumos', { metodo: 'POST', cuerpo: { nombre, unidad, activo: true } })
          avisar('Insumo creado (con saldo 0 en todas las sedes)')
          onListo()
        } catch (err) {
          avisar(err instanceof ErrorApi ? err.message : 'No se pudo crear', 'error')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <label className="grid gap-1">
        <span className="etiqueta">Nombre</span>
        <input className="campo" required minLength={2} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Pan de hamburguesa integral" />
      </label>
      <label className="grid gap-1">
        <span className="etiqueta">Unidad de medida</span>
        <select className="campo" value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
          <option value="g">Gramos (g)</option>
          <option value="ml">Mililitros (ml)</option>
          <option value="und">Unidades (und)</option>
        </select>
        <span className="text-xs text-tinta-soft">Las recetas y el inventario usan esta unidad. No se puede cambiar si el insumo tiene existencias.</span>
      </label>
      <button className="btn btn-rosa btn-lg" disabled={enviando || nombre.trim().length < 2}>
        Crear insumo
      </button>
    </form>
  )
}

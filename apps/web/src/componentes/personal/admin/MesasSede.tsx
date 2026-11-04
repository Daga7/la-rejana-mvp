'use client'

import { FORMAS_MESA, mesaSchema, NOMBRE_FORMA_MESA, type MesaDTO } from '@rejana/shared'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, LayoutGrid, Map as IconoPlano, Minus, Pencil, Plus, RotateCw, Users, X } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { api, ErrorApi, obtener } from '@/lib/api'
import { Plano, tamanoPlano } from '../mesero/Plano'

interface Borrador {
  numero: string
  zona: string
  puestos: string
  activa: boolean
}

const deMesa = (m: MesaDTO): Borrador => ({ numero: String(m.numero), zona: m.zona ?? '', puestos: String(m.puestos), activa: m.activa })

/** Mesas de una sede: plano por zona (ubicación, forma y tamaño) y lista (número, zona, puestos, en servicio). */
export function MesasSede({ sedeId }: { sedeId: string }) {
  const { data, mutate } = useSWR<{ mesas: MesaDTO[] }>(`/admin/sedes/${sedeId}/mesas`, obtener)
  const [editando, setEditando] = useState<string | 'nueva' | null>(null)
  const [vista, setVista] = useState<'plano' | 'lista'>('plano')

  /** Guarda un cambio de ubicación o forma (el servidor valida que no choque con otra mesa). */
  async function reubicar(m: MesaDTO, cambios: Partial<Pick<MesaDTO, 'x' | 'y' | 'ancho' | 'alto' | 'forma'>>) {
    const nueva = { numero: m.numero, zona: m.zona, puestos: m.puestos, activa: m.activa, x: m.x, y: m.y, ancho: m.ancho, alto: m.alto, forma: m.forma, ...cambios }
    try {
      await api(`/admin/mesas/${m.id}`, { metodo: 'PUT', cuerpo: nueva })
      await mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo mover la mesa', 'error')
    }
  }
  const mesas = data?.mesas ?? []
  const siguiente = mesas.reduce((max, m) => Math.max(max, m.numero), 0) + 1
  const ultimaZona = mesas.at(-1)?.zona ?? ''

  async function guardar(b: Borrador, id: string | null) {
    const r = mesaSchema.safeParse({ numero: Number(b.numero), zona: b.zona.trim() || null, puestos: Number(b.puestos), activa: b.activa })
    if (!r.success) {
      avisar(r.error.issues[0]?.message ?? 'Revisa los datos de la mesa', 'error')
      return
    }
    try {
      const actual = mesas.find((m) => m.id === id)
      // Misma zona: conserva su lugar en el plano. Otra zona: el servidor la ubica en un espacio libre.
      const lugar = actual && (actual.zona ?? '') === (r.data.zona ?? '') ? { x: actual.x, y: actual.y, ancho: actual.ancho, alto: actual.alto, forma: actual.forma } : {}
      if (id) await api(`/admin/mesas/${id}`, { metodo: 'PUT', cuerpo: { ...r.data, ...lugar } })
      else await api(`/admin/sedes/${sedeId}/mesas`, { metodo: 'POST', cuerpo: r.data })
      avisar(id ? `Mesa ${r.data.numero} actualizada` : `Mesa ${r.data.numero} creada`)
      setEditando(null)
      await mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo guardar la mesa', 'error')
    }
  }

  if (!data) return <div className="esqueleto h-48" />
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Vista">
        <button className={`btn btn-sm ${vista === 'plano' ? 'btn-amarillo' : 'btn-blanco'}`} aria-pressed={vista === 'plano'} onClick={() => setVista('plano')}>
          <IconoPlano size={16} aria-hidden /> Plano
        </button>
        <button className={`btn btn-sm ${vista === 'lista' ? 'btn-amarillo' : 'btn-blanco'}`} aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>
          <LayoutGrid size={16} aria-hidden /> Lista
        </button>
      </div>
      {vista === 'plano' ? (
        <EditorPlano mesas={mesas.filter((m) => m.activa)} onCambiar={reubicar} />
      ) : (
        <>
      <p className="text-sm text-tinta-soft">Los meseros ven estas mesas en el salón, agrupadas por zona. Una mesa fuera de servicio no aparece en el salón (su historial se conserva).</p>
      <ul className="grid gap-2">
        {mesas.map((m) =>
          editando === m.id ? (
            <li key={m.id}>
              <FilaEdicion inicial={deMesa(m)} onGuardar={(b) => guardar(b, m.id)} onCancelar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={m.id} className={`flex items-center gap-3 rounded-2xl border-2 border-tinta/15 bg-white px-3 py-2 ${m.activa ? '' : 'opacity-60'}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-tinta bg-crema text-lg font-black">{m.numero}</span>
              <span className="min-w-0 flex-1 text-sm">
                <b className="block">{m.zona ?? 'Sin zona'}</b>
                <span className="flex items-center gap-1 text-xs text-tinta-soft">
                  <Users size={12} aria-hidden /> {m.puestos} puestos{m.activa ? '' : ' · fuera de servicio'}
                </span>
              </span>
              <button className="btn btn-blanco btn-sm" onClick={() => setEditando(m.id)}>
                <Pencil size={15} aria-hidden /> Editar<span className="sr-only"> la mesa {m.numero}</span>
              </button>
            </li>
          ),
        )}
      </ul>
      {editando === 'nueva' ? (
        <FilaEdicion inicial={{ numero: String(siguiente), zona: ultimaZona, puestos: '4', activa: true }} onGuardar={(b) => guardar(b, null)} onCancelar={() => setEditando(null)} />
      ) : (
        <button className="btn btn-amarillo btn-sm w-fit" onClick={() => setEditando('nueva')}>
          <Plus size={16} aria-hidden /> Agregar mesa
        </button>
      )}
        </>
      )}
    </div>
  )
}

/**
 * Editor del plano de una zona, pensado también para el celular: se toca una mesa para elegirla y luego
 * la casilla donde va (o se mueve con las flechas). Cada cambio se guarda de inmediato.
 */
function EditorPlano({ mesas, onCambiar }: { mesas: MesaDTO[]; onCambiar: (m: MesaDTO, cambios: Partial<Pick<MesaDTO, 'x' | 'y' | 'ancho' | 'alto' | 'forma'>>) => Promise<void> }) {
  const zonas = [...new Set(mesas.map((m) => m.zona ?? 'Sin zona'))]
  const [zona, setZona] = useState<string | null>(null)
  const [elegidaId, setElegidaId] = useState<string | null>(null)
  const zonaActual = zona && zonas.includes(zona) ? zona : (zonas[0] ?? null)
  const deZona = mesas.filter((m) => (m.zona ?? 'Sin zona') === zonaActual)
  const elegida = deZona.find((m) => m.id === elegidaId) ?? null
  if (zonas.length === 0) return <p className="text-sm text-tinta-soft">No hay mesas en servicio. Agrégalas en la vista de lista.</p>
  const plano = tamanoPlano(deZona, 3)
  const mover = (dx: number, dy: number) => elegida && void onCambiar(elegida, { x: Math.max(0, elegida.x + dx), y: Math.max(0, elegida.y + dy) })
  return (
    <div className="grid gap-3">
      {zonas.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Zonas">
          {zonas.map((z) => (
            <button key={z} role="tab" aria-selected={z === zonaActual} onClick={() => (setZona(z), setElegidaId(null))} className={`btn btn-sm ${z === zonaActual ? 'btn-noche' : 'btn-blanco'}`}>
              {z}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-tinta-soft">{elegida ? `Toca la casilla a donde va la mesa ${elegida.numero}, o usa los controles.` : 'Toca una mesa para moverla, girarla o cambiar su forma.'}</p>
      <div className="sin-scroll overflow-x-auto">
        <Plano
          mesas={deZona}
          plano={plano}
          seleccionadaId={elegidaId}
          claseMesa={(m) => (m.id === elegidaId ? 'bg-amarillo text-tinta' : 'bg-white text-tinta')}
          contenido={(m) => (
            <span className="text-base font-black">
              <span className="sr-only">Mesa </span>
              {m.numero}
            </span>
          )}
          etiquetaMesa={(m) => `, ${m.puestos} puestos`}
          onMesa={(m) => setElegidaId(m.id === elegidaId ? null : m.id)}
          onCasilla={elegida ? (x, y) => void onCambiar(elegida, { x, y }) : undefined}
        />
      </div>
      {elegida && (
        <div className="grid gap-3 rounded-2xl border-2 border-tinta bg-amarillo-100 p-3">
          <p className="text-sm font-black">
            Mesa {elegida.numero} · {elegida.puestos} puestos · {elegida.ancho} × {elegida.alto}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Mover">
              <span />
              <button className="btn btn-blanco btn-sm !px-2" onClick={() => mover(0, -1)} aria-label="Mover hacia arriba">
                <ArrowUp size={16} aria-hidden />
              </button>
              <span />
              <button className="btn btn-blanco btn-sm !px-2" onClick={() => mover(-1, 0)} aria-label="Mover a la izquierda">
                <ArrowLeft size={16} aria-hidden />
              </button>
              <button className="btn btn-blanco btn-sm !px-2" onClick={() => mover(0, 1)} aria-label="Mover hacia abajo">
                <ArrowDown size={16} aria-hidden />
              </button>
              <button className="btn btn-blanco btn-sm !px-2" onClick={() => mover(1, 0)} aria-label="Mover a la derecha">
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
            <div className="grid gap-1">
              <button className="btn btn-blanco btn-sm" onClick={() => void onCambiar(elegida, { ancho: elegida.alto, alto: elegida.ancho })}>
                <RotateCw size={16} aria-hidden /> Girar
              </button>
              <div className="flex gap-1">
                <button className="btn btn-blanco btn-sm !px-2" disabled={Math.max(elegida.ancho, elegida.alto) <= 1} onClick={() => void onCambiar(elegida, elegida.ancho >= elegida.alto ? { ancho: elegida.ancho - 1 } : { alto: elegida.alto - 1 })} aria-label="Más corta">
                  <Minus size={16} aria-hidden />
                </button>
                <button className="btn btn-blanco btn-sm !px-2" disabled={Math.max(elegida.ancho, elegida.alto) >= 4} onClick={() => void onCambiar(elegida, elegida.ancho >= elegida.alto ? { ancho: elegida.ancho + 1 } : { alto: elegida.alto + 1 })} aria-label="Más larga">
                  <Plus size={16} aria-hidden />
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Forma">
            {FORMAS_MESA.map((f) => (
              <button key={f} className={`btn btn-sm ${elegida.forma === f ? 'btn-noche' : 'btn-blanco'}`} aria-pressed={elegida.forma === f} onClick={() => void onCambiar(elegida, { forma: f })}>
                {NOMBRE_FORMA_MESA[f]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FilaEdicion({ inicial, onGuardar, onCancelar }: { inicial: Borrador; onGuardar: (b: Borrador) => Promise<void>; onCancelar: () => void }) {
  const [b, setB] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  return (
    <form
      className="grid gap-2 rounded-2xl border-2 border-tinta bg-amarillo-100 p-3 sm:grid-cols-[5rem_1fr_6rem]"
      onSubmit={async (e) => {
        e.preventDefault()
        setGuardando(true)
        await onGuardar(b)
        setGuardando(false)
      }}
    >
      <label className="grid gap-1">
        <span className="etiqueta">Número</span>
        <input className="campo" inputMode="numeric" required value={b.numero} onChange={(e) => setB({ ...b, numero: e.target.value })} />
      </label>
      <label className="grid gap-1">
        <span className="etiqueta">Zona</span>
        <input className="campo" maxLength={40} value={b.zona} onChange={(e) => setB({ ...b, zona: e.target.value })} placeholder="Salón, Terraza…" />
      </label>
      <label className="grid gap-1">
        <span className="etiqueta">Puestos</span>
        <input className="campo" inputMode="numeric" required value={b.puestos} onChange={(e) => setB({ ...b, puestos: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3">
        <input type="checkbox" className="h-5 w-5 accent-rosa" checked={b.activa} onChange={(e) => setB({ ...b, activa: e.target.checked })} /> En servicio
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button className="btn btn-rosa btn-sm" disabled={guardando}>
          <Check size={16} aria-hidden /> Guardar
        </button>
        <button type="button" className="btn btn-blanco btn-sm" onClick={onCancelar}>
          <X size={16} aria-hidden /> Cancelar
        </button>
      </div>
    </form>
  )
}

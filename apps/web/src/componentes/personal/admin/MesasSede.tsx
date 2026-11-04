'use client'

import { mesaSchema, type MesaDTO } from '@rejana/shared'
import { Check, Pencil, Plus, Users, X } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { api, ErrorApi, obtener } from '@/lib/api'

interface Borrador {
  numero: string
  zona: string
  puestos: string
  activa: boolean
}

const deMesa = (m: MesaDTO): Borrador => ({ numero: String(m.numero), zona: m.zona ?? '', puestos: String(m.puestos), activa: m.activa })

/** Mesas de una sede: número, zona del salón, puestos y si está en servicio. */
export function MesasSede({ sedeId }: { sedeId: string }) {
  const { data, mutate } = useSWR<{ mesas: MesaDTO[] }>(`/admin/sedes/${sedeId}/mesas`, obtener)
  const [editando, setEditando] = useState<string | 'nueva' | null>(null)
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
      if (id) await api(`/admin/mesas/${id}`, { metodo: 'PUT', cuerpo: r.data })
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

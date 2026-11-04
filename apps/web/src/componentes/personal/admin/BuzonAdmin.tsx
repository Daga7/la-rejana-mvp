'use client'

import { fecha, NOMBRE_ESTADO_BUZON, type BuzonMensajeDTO, type EstadoBuzon } from '@rejana/shared'
import { EyeOff, Lightbulb, MessageSquareWarning } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { api, ErrorApi, obtener } from '@/lib/api'

const ESTADOS: (EstadoBuzon | 'todos')[] = ['todos', 'nueva', 'en_revision', 'resuelta']
const COLOR: Record<EstadoBuzon, string> = { nueva: 'bg-rosa-100 text-rosa-600', en_revision: 'bg-amarillo-100 text-amarillo-600', resuelta: 'bg-verde-100 text-verde' }

export function BuzonAdmin() {
  const [filtro, setFiltro] = useState<EstadoBuzon | 'todos'>('nueva')
  const { data, mutate } = useSWR<{ mensajes: BuzonMensajeDTO[] }>(`/admin/buzon${filtro === 'todos' ? '' : `?estado=${filtro}`}`, obtener)

  async function cambiar(id: string, estado: EstadoBuzon) {
    try {
      await api(`/admin/buzon/${id}`, { metodo: 'PATCH', cuerpo: { estado } })
      avisar(`Marcado como «${NOMBRE_ESTADO_BUZON[estado]}»`)
      void mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo actualizar', 'error')
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="acento text-lg">Solo tú lo ves</p>
          <h1 className="titulo text-3xl">Buzón del equipo</h1>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Estado">
          {ESTADOS.map((e) => (
            <button key={e} role="tab" aria-selected={filtro === e} onClick={() => setFiltro(e)} className={`btn btn-sm ${filtro === e ? 'btn-amarillo' : 'btn-noche'}`}>
              {e === 'todos' ? 'Todos' : NOMBRE_ESTADO_BUZON[e]}
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <div className="esqueleto h-60" />
      ) : data.mensajes.length === 0 ? (
        <p className="py-10 text-center text-noche-300">No hay mensajes {filtro !== 'todos' ? `«${NOMBRE_ESTADO_BUZON[filtro]}»` : ''}.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {data.mensajes.map((m) => (
            <li key={m.id} className="sticker grid gap-3 p-4 text-tinta">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chip ${m.tipo === 'queja' ? 'bg-rojo-100 text-rojo-600' : 'bg-azul-100 text-azul'}`}>
                  {m.tipo === 'queja' ? <MessageSquareWarning size={13} aria-hidden /> : <Lightbulb size={13} aria-hidden />} {m.tipo === 'queja' ? 'Queja' : 'Sugerencia'}
                </span>
                <span className={`chip ${COLOR[m.estado]}`}>{NOMBRE_ESTADO_BUZON[m.estado]}</span>
                <span className="ml-auto text-xs text-tinta-soft">{fecha(`${m.fecha}T12:00:00-05:00`)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{m.mensaje}</p>
              <p className="flex items-center gap-1.5 text-xs text-tinta-soft">
                {m.anonimo ? (
                  <>
                    <EyeOff size={13} aria-hidden /> Anónimo
                  </>
                ) : (
                  <>
                    {m.autorNombre} · {m.sedeNombre ?? 'Todas las sedes'}
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {(['nueva', 'en_revision', 'resuelta'] as EstadoBuzon[])
                  .filter((e) => e !== m.estado)
                  .map((e) => (
                    <button key={e} className="btn btn-blanco btn-sm" onClick={() => void cambiar(m.id, e)}>
                      Marcar «{NOMBRE_ESTADO_BUZON[e]}»
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

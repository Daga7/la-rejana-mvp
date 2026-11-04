'use client'

import { fechaHora, hora, NOMBRE_ROL, type PeriodoReporte, type ReporteTurnosDTO, type SedePublicaDTO, type TurnoDTO } from '@rejana/shared'
import { AlertTriangle, Download, Lock } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'
import { duracion } from '../BotonTurno'

const PERIODOS: [PeriodoReporte, string][] = [
  ['hoy', 'Hoy'],
  ['ayer', 'Ayer'],
  ['esta_semana', 'Esta semana'],
  ['semana_pasada', 'Semana pasada'],
  ['este_mes', 'Este mes'],
  ['mes_pasado', 'Mes pasado'],
  ['ultimos_30_dias', 'Últimos 30 días'],
]

/** Fecha y hora local (Bogotá) para un <input type="datetime-local">. */
function aLocal(iso: string) {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000)
  return d.toISOString().slice(0, 16)
}

function csv(reporte: ReporteTurnosDTO): string {
  const filas = [['Persona', 'Rol', 'Sede', 'Entrada', 'Salida', 'Minutos', 'Nota']]
  for (const t of reporte.turnos) filas.push([t.usuarioNombre, NOMBRE_ROL[t.rol], t.sedeNombre, fechaHora(t.entradaEn), t.salidaEn ? fechaHora(t.salidaEn) : 'En turno', String(t.minutos), t.nota ?? ''])
  return filas.map((f) => f.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\n')
}

export function TurnosAdmin() {
  const [periodo, setPeriodo] = useState<PeriodoReporte>('esta_semana')
  const [sedeId, setSedeId] = useState('')
  const [cerrando, setCerrando] = useState<TurnoDTO | null>(null)
  const { data: sedes } = useSWR<{ sedes: SedePublicaDTO[] }>('/sedes', obtener)
  const { data, mutate } = useSWR<{ reporte: ReporteTurnosDTO }>(`/admin/turnos?periodo=${periodo}${sedeId ? `&sedeId=${sedeId}` : ''}`, obtener, { refreshInterval: 60_000 })
  const reporte = data?.reporte

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="acento text-lg">Entradas y salidas del personal</p>
          <h1 className="titulo text-3xl">Turnos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-bold">
            <span className="text-noche-300">Sede</span>
            <select className="campo !min-h-10 !w-auto !py-1.5" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
              <option value="">Todas</option>
              {sedes?.sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <span className="text-noche-300">Periodo</span>
            <select className="campo !min-h-10 !w-auto !py-1.5" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoReporte)}>
              {PERIODOS.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {reporte && reporte.turnos.length > 0 && (
            <a className="btn btn-blanco btn-sm" download={`turnos-${reporte.desde}-a-${reporte.hasta}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + csv(reporte))}`}>
              <Download size={16} aria-hidden /> CSV
            </a>
          )}
        </div>
      </div>

      {!reporte ? (
        <div className="esqueleto h-64" />
      ) : (
        <>
          <section className="sticker overflow-x-auto p-4 text-tinta" aria-labelledby="t-horas">
            <h2 id="t-horas" className="mb-2 font-black">
              Horas por persona <span className="text-sm font-semibold text-tinta-soft">· {reporte.etiqueta}</span>
            </h2>
            {reporte.resumen.length === 0 ? (
              <p className="py-4 text-sm text-tinta-soft">Nadie marcó turno en este periodo.</p>
            ) : (
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b-2 border-tinta/10 text-left text-xs uppercase text-tinta-soft">
                    <th className="py-2">Persona</th>
                    <th>Rol</th>
                    <th>Sede</th>
                    <th className="text-right">Turnos</th>
                    <th className="text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.resumen.map((r) => (
                    <tr key={r.usuarioId} className="border-b border-tinta/5">
                      <td className="py-2 font-bold">{r.usuarioNombre}</td>
                      <td>{NOMBRE_ROL[r.rol]}</td>
                      <td>{r.sedeNombre}</td>
                      <td className="text-right tabular-nums">
                        {r.turnos}
                        {r.abiertos > 0 && <span className="ml-1 text-xs font-bold text-turquesa-700">({r.abiertos} en curso)</span>}
                      </td>
                      <td className="text-right font-black tabular-nums">{duracion(r.minutos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="sticker overflow-x-auto p-4 text-tinta" aria-labelledby="t-detalle">
            <h2 id="t-detalle" className="mb-2 font-black">
              Detalle
            </h2>
            {reporte.turnos.length === 0 ? (
              <p className="py-4 text-sm text-tinta-soft">Sin turnos.</p>
            ) : (
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b-2 border-tinta/10 text-left text-xs uppercase text-tinta-soft">
                    <th className="py-2">Persona</th>
                    <th>Sede</th>
                    <th>Entrada</th>
                    <th>Salida</th>
                    <th className="text-right">Duración</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...reporte.turnos].reverse().map((t) => (
                    <tr key={t.id} className="border-b border-tinta/5 align-top">
                      <td className="py-2 font-bold">
                        {t.usuarioNombre}
                        <span className="block text-xs font-normal text-tinta-soft">{NOMBRE_ROL[t.rol]}</span>
                      </td>
                      <td>{t.sedeNombre}</td>
                      <td className="tabular-nums">{fechaHora(t.entradaEn)}</td>
                      <td className="tabular-nums">
                        {t.salidaEn ? (t.salidaEn.slice(0, 10) === t.entradaEn.slice(0, 10) ? hora(t.salidaEn) : fechaHora(t.salidaEn)) : <span className="font-bold text-turquesa-700">En turno</span>}
                        {t.cerradoPorAdmin && <span className="block text-xs text-tinta-soft">Cerrado por el admin: {t.nota}</span>}
                      </td>
                      <td className="text-right tabular-nums">
                        {duracion(t.minutos)}
                        {t.revisar && (
                          <span className="mt-0.5 flex items-center justify-end gap-1 text-xs font-bold text-rojo-600">
                            <AlertTriangle size={12} aria-hidden /> Revisar
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        {t.abierto && (
                          <button className="btn btn-blanco btn-sm" onClick={() => setCerrando(t)}>
                            <Lock size={14} aria-hidden /> Cerrar<span className="sr-only"> el turno de {t.usuarioNombre}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <Hoja abierta={!!cerrando} onCerrar={() => setCerrando(null)} titulo={`Cerrar el turno de ${cerrando?.usuarioNombre ?? ''}`} ancho="max-w-md">
        {cerrando && <FormCerrarTurno turno={cerrando} onListo={async () => (setCerrando(null), await mutate())} />}
      </Hoja>
    </div>
  )
}

function FormCerrarTurno({ turno, onListo }: { turno: TurnoDTO; onListo: () => void }) {
  const [salida, setSalida] = useState(aLocal(new Date().toISOString()))
  const [nota, setNota] = useState('Olvidó marcar la salida')
  const [enviando, setEnviando] = useState(false)
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        try {
          await api(`/admin/turnos/${turno.id}/cerrar`, { metodo: 'POST', cuerpo: { salidaEn: `${salida}:00-05:00`, nota } })
          avisar('Turno cerrado')
          onListo()
        } catch (err) {
          avisar(err instanceof ErrorApi ? err.message : 'No se pudo cerrar el turno', 'error')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <p className="text-sm">
        Entró el <b>{fechaHora(turno.entradaEn)}</b> y no marcó la salida. Escribe la hora real (hora de Bogotá).
      </p>
      <label className="grid gap-1">
        <span className="etiqueta">Hora de salida</span>
        <input className="campo" type="datetime-local" required value={salida} min={aLocal(turno.entradaEn)} onChange={(e) => setSalida(e.target.value)} />
      </label>
      <label className="grid gap-1">
        <span className="etiqueta">Motivo</span>
        <input className="campo" required minLength={3} maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>
      <button className="btn btn-rosa btn-lg" disabled={enviando}>
        Cerrar turno
      </button>
    </form>
  )
}

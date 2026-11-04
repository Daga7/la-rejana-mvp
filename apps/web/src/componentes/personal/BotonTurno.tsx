'use client'

import { hora, minutosDesde, type TurnoDTO } from '@rejana/shared'
import { Clock, LogIn, LogOut } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'
import { useTic } from './comunes'

/** 510 → «8 h 30 min». */
export function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/** Entrada y salida del turno, desde la barra del módulo. La hora la pone el servidor. */
export function BotonTurno() {
  const { data, mutate } = useSWR<{ turno: TurnoDTO | null }>('/turnos/actual', obtener, { refreshInterval: 60_000 })
  const [abierta, setAbierta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  useTic()
  if (!data) return null
  const turno = data.turno
  // Se re-dibuja cada 30 s (useTic) con el mismo ayudante que usan los demás relojes del personal.
  const minutos = turno ? Math.max(0, minutosDesde(turno.entradaEn)) : 0

  async function marcar(tipo: 'entrada' | 'salida') {
    setEnviando(true)
    try {
      const r = await api<{ turno: TurnoDTO }>(`/turnos/${tipo}`, { metodo: 'POST' })
      avisar(tipo === 'entrada' ? `Entrada marcada a las ${hora(r.turno.entradaEn)}` : `Salida marcada: trabajaste ${duracion(r.turno.minutos)}`)
      setAbierta(false)
      await mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo marcar el turno', 'error')
      await mutate()
    } finally {
      setEnviando(false)
    }
  }

  if (!turno) {
    return (
      <button className="btn btn-amarillo btn-sm" disabled={enviando} onClick={() => void marcar('entrada')}>
        <LogIn size={16} aria-hidden /> <span className="hidden sm:inline">Marcar entrada</span>
        <span className="sm:hidden">Entrada</span>
      </button>
    )
  }
  return (
    <>
      <button className="btn btn-turquesa btn-sm tabular-nums" onClick={() => setAbierta(true)} aria-haspopup="dialog">
        <Clock size={16} aria-hidden /> <span className="sr-only">En turno: </span>
        {duracion(minutos)}
      </button>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo="Tu turno" ancho="max-w-sm">
        <div className="grid gap-4 text-center">
          <p>
            Entraste a las <b>{hora(turno.entradaEn)}</b>
            <span className="block text-2xl font-black tabular-nums">{duracion(minutos)}</span>
          </p>
          <button className="btn btn-rojo btn-lg" disabled={enviando} onClick={() => void marcar('salida')}>
            <LogOut size={18} aria-hidden /> Marcar salida
          </button>
          <p className="text-xs text-tinta-soft">La hora la registra el sistema. Si olvidas marcar la salida, el administrador la corrige.</p>
        </div>
      </Hoja>
    </>
  )
}

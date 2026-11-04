'use client'

import { minutosDesde, type SedePublicaDTO } from '@rejana/shared'
import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { obtener } from '@/lib/api'
import { useSesion } from '@/lib/sesion'

const CLAVE_SEDE = 'rejana-sede-operacion'
const oyentes = new Set<() => void>()
function suscribirSede(cb: () => void) {
  oyentes.add(cb)
  return () => oyentes.delete(cb)
}
function sedeGuardada() {
  return typeof window === 'undefined' ? null : localStorage.getItem(CLAVE_SEDE)
}

/** Sede sobre la que opera la pantalla: la del empleado, o la que elija el admin (se recuerda). */
export function useSedeOperacion() {
  const { usuario } = useSesion()
  const { data } = useSWR<{ sedes: SedePublicaDTO[] }>('/sedes', obtener)
  const guardada = useSyncExternalStore(suscribirSede, sedeGuardada, () => null)
  const sedes = data?.sedes ?? []
  const esAdmin = usuario?.rol === 'admin'
  const sedeId = esAdmin ? (sedes.find((s) => s.id === guardada)?.id ?? sedes[0]?.id ?? null) : (usuario?.sedeId ?? null)
  return {
    sedeId,
    sede: sedes.find((s) => s.id === sedeId) ?? null,
    sedes,
    esAdmin,
    elegir: (id: string) => {
      localStorage.setItem(CLAVE_SEDE, id)
      oyentes.forEach((f) => f())
    },
  }
}

export function SelectorSede({ claro = false }: { claro?: boolean }) {
  const { sedeId, sedes, esAdmin, elegir, sede } = useSedeOperacion()
  if (!esAdmin) return sede ? <span className={`chip ${claro ? 'bg-crema-200 text-tinta' : 'bg-white/10 text-white'}`}>Sede {sede.nombre}</span> : null
  return (
    <label className="flex items-center gap-2 text-sm font-bold">
      <span className={claro ? 'text-tinta' : 'text-noche-300'}>Sede</span>
      <select className="campo !min-h-10 !w-auto !py-1.5" value={sedeId ?? ''} onChange={(e) => elegir(e.target.value)}>
        {sedes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Hace que el componente se re-dibuje cada `ms` (para relojes y minutos transcurridos). */
export function useTic(ms = 30_000) {
  const [, setT] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setT((t) => t + 1), ms)
    return () => clearInterval(i)
  }, [ms])
}

export function Transcurrido({ desde, alerta = 15, critico = 25 }: { desde: string; alerta?: number; critico?: number }) {
  useTic()
  const min = minutosDesde(desde)
  const clase = min >= critico ? 'bg-rojo text-white' : min >= alerta ? 'bg-naranja text-tinta' : 'bg-crema-200 text-tinta'
  return (
    <span className={`chip border-2 border-tinta tabular-nums ${clase}`} title="Minutos desde que llegó el pedido">
      {min} min
    </span>
  )
}

// --- Sonido de pedido nuevo (Web Audio: sin archivos) -----------------------------------------
let ctxAudio: AudioContext | null = null
export function sonarCampana() {
  try {
    ctxAudio ??= new AudioContext()
    const ahora = ctxAudio.currentTime
    for (const [i, f] of [880, 1320, 1760].entries()) {
      const o = ctxAudio.createOscillator()
      const g = ctxAudio.createGain()
      o.type = 'triangle'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ahora + i * 0.12)
      g.gain.exponentialRampToValueAtTime(0.25, ahora + i * 0.12 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ahora + i * 0.12 + 0.35)
      o.connect(g).connect(ctxAudio.destination)
      o.start(ahora + i * 0.12)
      o.stop(ahora + i * 0.12 + 0.4)
    }
  } catch {
    // Sin audio disponible: el aviso visual basta.
  }
}

/** Los navegadores solo permiten sonido después de un toque: este botón lo habilita. */
export function BotonSonido({ activo, onCambiar }: { activo: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <button
      className={`btn btn-sm ${activo ? 'btn-turquesa' : 'btn-blanco'}`}
      onClick={() => {
        if (!activo) sonarCampana()
        onCambiar(!activo)
      }}
      aria-pressed={activo}
    >
      {activo ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />} {activo ? 'Sonido activo' : 'Activar sonido'}
    </button>
  )
}

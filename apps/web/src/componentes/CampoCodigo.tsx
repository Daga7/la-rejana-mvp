'use client'

import { useEffect, useRef } from 'react'

/** Campo para el código de 6 dígitos (autocompletado desde el SMS/correo en iOS y Android). */
export function CampoCodigo({ valor, onCambio, onCompleto, error, deshabilitado }: { valor: string; onCambio: (v: string) => void; onCompleto?: (v: string) => void; error?: string; deshabilitado?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div>
      <label htmlFor="codigo" className="etiqueta">
        Código de 6 dígitos
      </label>
      <input
        ref={ref}
        id="codigo"
        name="codigo"
        className="campo text-center font-mono text-3xl font-black tracking-[0.5em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={valor}
        disabled={deshabilitado}
        aria-invalid={!!error}
        onChange={(e) => {
          const limpio = e.target.value.replace(/\D/g, '').slice(0, 6)
          onCambio(limpio)
          if (limpio.length === 6) onCompleto?.(limpio)
        }}
      />
    </div>
  )
}

/** Botón de reenvío con cuenta regresiva. */
export function BotonReenviar({ segundos, onReenviar, cargando }: { segundos: number; onReenviar: () => void; cargando: boolean }) {
  return (
    <button type="button" className="btn btn-fantasma btn-sm w-full text-tinta-soft !text-tinta" onClick={onReenviar} disabled={segundos > 0 || cargando}>
      {segundos > 0 ? `Reenviar código en ${segundos} s` : cargando ? 'Enviando…' : '¿No llegó? Reenviar código'}
    </button>
  )
}

export function useCuentaRegresiva(inicial: number) {
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  return {
    iniciar(setSegundos: (fn: (s: number) => number) => void, desde = inicial) {
      setSegundos(() => desde)
      if (ref.current) clearInterval(ref.current)
      ref.current = setInterval(() => {
        setSegundos((s) => {
          if (s <= 1 && ref.current) clearInterval(ref.current)
          return Math.max(0, s - 1)
        })
      }, 1000)
    },
  }
}

'use client'

import { buzonSchema, type TipoBuzon } from '@rejana/shared'
import { EyeOff, Lightbulb, MessageSquareWarning, ShieldCheck } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import { avisar } from '@/componentes/Avisos'
import { api, ErrorApi } from '@/lib/api'

export function BuzonEmpleado() {
  const [tipo, setTipo] = useState<TipoBuzon>('sugerencia')
  const [mensaje, setMensaje] = useState('')
  const [anonimo, setAnonimo] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const r = buzonSchema.safeParse({ tipo, mensaje, anonimo })
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisa el mensaje')
    setEnviando(true)
    try {
      await api('/buzon', { metodo: 'POST', cuerpo: r.data })
      setEnviado(true)
      setMensaje('')
      avisar('¡Gracias! Tu mensaje llegó al administrador')
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div>
        <p className="acento text-lg">Tu voz cuenta</p>
        <h1 className="titulo text-3xl">Buzón de quejas y sugerencias</h1>
      </div>
      <AnimatePresence mode="wait">
        {enviado ? (
          <m.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="sticker p-6 text-center text-tinta">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/sticker-celebra-fijo.webp" alt="" width={120} height={120} className="mx-auto" />
            <p className="mt-2 text-xl font-black">¡Mensaje enviado!</p>
            <p className="mt-1 text-sm text-tinta-soft">Solo lo lee el administrador.</p>
            <button className="btn btn-amarillo mt-4" onClick={() => setEnviado(false)}>
              Escribir otro
            </button>
          </m.div>
        ) : (
          <m.form key="form" onSubmit={enviar} className="sticker grid gap-4 p-5 text-tinta" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de mensaje">
              {(
                [
                  ['sugerencia', 'Sugerencia', Lightbulb],
                  ['queja', 'Queja', MessageSquareWarning],
                ] as const
              ).map(([valor, texto, Icono]) => (
                <button key={valor} type="button" role="radio" aria-checked={tipo === valor} onClick={() => setTipo(valor)} className={`flex items-center justify-center gap-2 rounded-2xl border-2 border-tinta p-3 font-bold ${tipo === valor ? 'bg-amarillo shadow-sticker-sm' : 'bg-white'}`}>
                  <Icono size={18} aria-hidden /> {texto}
                </button>
              ))}
            </div>
            <label className="grid gap-1">
              <span className="etiqueta">Tu mensaje</span>
              <textarea className="campo min-h-40" maxLength={2000} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder={tipo === 'queja' ? 'Cuéntanos qué pasó y cómo podríamos mejorarlo…' : '¿Qué idea tienes para que el parche funcione mejor?'} />
              <span className="text-right text-xs text-tinta-soft tabular-nums">{mensaje.length}/2000</span>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 ${anonimo ? 'border-turquesa bg-turquesa-100' : 'border-tinta/20 bg-white'}`}>
              <input type="checkbox" className="mt-1 h-5 w-5 accent-turquesa" checked={anonimo} onChange={(e) => setAnonimo(e.target.checked)} />
              <span className="text-sm">
                <b className="flex items-center gap-1.5">
                  <EyeOff size={16} aria-hidden /> Enviar de forma anónima
                </b>
                {anonimo ? (
                  <span className="mt-1 block">No guardamos tu nombre, tu sede ni la hora (solo la fecha). Ni el administrador ni el sistema pueden saber que fuiste tú. Evita escribir datos que te identifiquen.</span>
                ) : (
                  <span className="mt-1 block">El administrador verá tu nombre y tu sede para poder responderte.</span>
                )}
              </span>
            </label>
            {error && (
              <p className="text-sm font-bold text-rojo-600" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-rosa btn-lg" disabled={enviando}>
              Enviar {tipo}
            </button>
            <p className="flex items-center gap-1.5 text-xs text-tinta-soft">
              <ShieldCheck size={14} aria-hidden /> Solo el administrador lee el buzón.
            </p>
          </m.form>
        )}
      </AnimatePresence>
    </div>
  )
}

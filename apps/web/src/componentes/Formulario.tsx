'use client'

import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import type { ZodError } from 'zod'

export type Errores = Record<string, string | undefined>

/** Convierte un error de Zod en { campo: primer mensaje }. */
export function erroresDeZod(error: ZodError): Errores {
  const out: Errores = {}
  for (const issue of error.issues) {
    const clave = String(issue.path[0] ?? '_')
    out[clave] ??= issue.message
  }
  return out
}

/** Errores de campo que vienen de la API ({ campos: { correo: ['…'] } }). */
export function erroresDeApi(campos?: Record<string, string[]>): Errores {
  const out: Errores = {}
  for (const [k, v] of Object.entries(campos ?? {})) out[k.split('.')[0]!] = v[0]
  return out
}

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string
  error?: string
  ayuda?: ReactNode
  oscuro?: boolean
}

export function Campo({ etiqueta, error, ayuda, oscuro, id, className = '', ...resto }: PropsCampo) {
  const generado = useId()
  const idCampo = id ?? generado
  return (
    <div className={className}>
      <label htmlFor={idCampo} className={`etiqueta ${oscuro ? 'text-noche-300' : 'text-tinta'}`}>
        {etiqueta}
      </label>
      <input id={idCampo} className="campo" aria-invalid={!!error} aria-describedby={error ? `${idCampo}-error` : ayuda ? `${idCampo}-ayuda` : undefined} {...resto} />
      <MensajeCampo id={`${idCampo}-error`} error={error} />
      {!error && ayuda && (
        <p id={`${idCampo}-ayuda`} className={`mt-1 text-xs ${oscuro ? 'text-noche-300' : 'text-tinta-soft'}`}>
          {ayuda}
        </p>
      )}
    </div>
  )
}

export function MensajeCampo({ id, error }: { id?: string; error?: string }) {
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.p
          id={id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-1 text-sm font-semibold text-rojo-600"
          role="alert"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

export function CampoClave(props: Omit<PropsCampo, 'type'>) {
  const [ver, setVer] = useState(false)
  return (
    <div className="relative">
      <Campo {...props} type={ver ? 'text' : 'password'} className={`${props.className ?? ''} [&_input]:pr-12`} />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="absolute right-2 top-[1.85rem] grid h-9 w-9 place-items-center rounded-full text-tinta-soft hover:bg-black/5"
        aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={ver}
      >
        {ver ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

export function BotonEnviar({ cargando, children, className = 'btn-rosa', disabled }: { cargando: boolean; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button type="submit" className={`btn btn-lg w-full ${className}`} disabled={cargando || disabled} aria-busy={cargando}>
      {cargando ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function AlertaError({ mensaje }: { mensaje: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {mensaje && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="alert"
          className="rounded-xl border-2 border-tinta bg-rojo-100 px-4 py-3 text-sm font-semibold text-rojo-600"
        >
          {mensaje}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Indicador sencillo de fortaleza (longitud y variedad), sin reglas de composición obligatorias. */
export function FortalezaClave({ clave }: { clave: string }) {
  if (!clave) return null
  const variedad = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/, /\s/].filter((r) => r.test(clave)).length
  const puntos = Math.min(4, Math.floor(clave.length / 4) + (variedad >= 3 ? 1 : 0) - (clave.length < 8 ? 2 : 0))
  const nivel = Math.max(0, puntos)
  const textos = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente']
  const colores = ['bg-rojo', 'bg-naranja', 'bg-amarillo', 'bg-turquesa', 'bg-verde']
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < nivel ? colores[nivel] : 'bg-tinta/15'}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-tinta-soft">
        Fortaleza: <b>{textos[nivel]}</b>. Una frase de varias palabras es fácil de recordar y difícil de adivinar.
      </p>
    </div>
  )
}

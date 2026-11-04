'use client'

import type { SolicitudReporte } from '@rejana/shared'
import { Download, FileText, Loader2, MessageCircle, Mic, Send, Sparkles } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { api, ErrorApi, obtener } from '@/lib/api'

interface Estado {
  whatsapp: 'meta' | 'consola'
  ia: 'anthropic' | 'reglas'
  modeloIa: string | null
  transcripcion: 'openai' | 'mock'
  webhook: string
  numerosAutorizados: string[]
}

type Resultado =
  | { tipo: 'pdf'; solicitud: SolicitudReporte; nombreArchivo: string; leyenda: string; pdfBase64: string }
  | { tipo: 'texto'; mensaje: string; solicitud: SolicitudReporte | null }

const EJEMPLOS = ['Envíame el reporte de ventas de este mes', '¿Cuánto inventario de pan hay en la sede de Villaluz?', '¿Qué productos se vendieron más la semana pasada?', 'Ventas de ayer en Normandía']
const TIPO: Record<SolicitudReporte['tipo'], string> = { ventas: 'Ventas', productos_mas_vendidos: 'Productos más vendidos', inventario: 'Inventario' }

function describir(s: SolicitudReporte): string {
  const partes = [TIPO[s.tipo], s.sede ? `sede ${s.sede}` : 'todas las sedes']
  if (s.periodo) partes.push(s.periodo.replaceAll('_', ' '))
  if (s.desde) partes.push(`del ${s.desde} al ${s.hasta ?? 'hoy'}`)
  if (s.insumo) partes.push(`insumo «${s.insumo}»`)
  return partes.join(' · ')
}

export function AsistenteAdmin() {
  const { data: estado } = useSWR<Estado>('/admin/asistente/estado', obtener)
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [enlacePdf, setEnlacePdf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(
    () => () => {
      if (enlacePdf) URL.revokeObjectURL(enlacePdf)
    },
    [enlacePdf],
  )

  async function probar(t = texto) {
    if (t.trim().length < 3) return
    setCargando(true)
    setError(null)
    setResultado(null)
    try {
      const r = await api<Resultado>('/admin/asistente/probar', { metodo: 'POST', cuerpo: { texto: t } })
      if (r.tipo === 'pdf') {
        const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0))
        setEnlacePdf(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })))
      }
      setResultado(r)
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo generar el reporte')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <p className="acento text-lg">Reportes en PDF por WhatsApp</p>
        <h1 className="titulo text-3xl">Asistente</h1>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="sticker grid gap-4 p-5 text-tinta" aria-labelledby="t-probar">
          <h2 id="t-probar" className="flex items-center gap-2 font-extrabold">
            <Sparkles size={18} aria-hidden /> Pruébalo aquí
          </h2>
          <p className="text-sm text-tinta-soft">Escribe como le escribirías por WhatsApp. El asistente solo entiende reportes de ventas, productos más vendidos e inventario: nunca ejecuta otras órdenes.</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void probar()
            }}
          >
            <input className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} placeholder="Ej.: ventas de este mes en Villaluz" aria-label="Mensaje para el asistente" />
            <button className="btn btn-rosa shrink-0" disabled={cargando || texto.trim().length < 3} aria-label="Enviar">
              {cargando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {EJEMPLOS.map((ej) => (
              <button
                key={ej}
                className="chip border-2 border-tinta/20 bg-white !py-1.5 text-left text-xs hover:border-tinta"
                onClick={() => {
                  setTexto(ej)
                  void probar(ej)
                }}
              >
                {ej}
              </button>
            ))}
          </div>
          {error && (
            <p className="text-sm font-bold text-rojo-600" role="alert">
              {error}
            </p>
          )}
          <AnimatePresence mode="wait">
            {resultado && (
              <m.div key={resultado.tipo + (resultado.solicitud?.tipo ?? '')} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-3 rounded-2xl border-2 border-tinta bg-white p-4" role="status">
                {resultado.solicitud && (
                  <p className="text-xs font-bold uppercase tracking-wider text-tinta-soft">
                    Entendí: <span className="normal-case text-tinta">{describir(resultado.solicitud)}</span>
                  </p>
                )}
                <p className="whitespace-pre-line text-sm">{resultado.tipo === 'pdf' ? resultado.leyenda : resultado.mensaje}</p>
                {resultado.tipo === 'pdf' && enlacePdf && (
                  <a href={enlacePdf} download={resultado.nombreArchivo} className="btn btn-turquesa w-fit">
                    <FileText size={18} aria-hidden /> Descargar {resultado.nombreArchivo}
                  </a>
                )}
              </m.div>
            )}
          </AnimatePresence>
        </section>

        <div className="grid gap-5">
          <section className="sticker grid gap-2 p-5 text-sm text-tinta" aria-labelledby="t-estado">
            <h2 id="t-estado" className="flex items-center gap-2 font-extrabold">
              <MessageCircle size={18} aria-hidden /> Conexión con WhatsApp
            </h2>
            {!estado ? (
              <div className="esqueleto-claro h-24" />
            ) : (
              <>
                <p>
                  <b>WhatsApp:</b> {estado.whatsapp === 'meta' ? 'Cloud API de Meta (real)' : 'Modo de prueba: los PDF se guardan en el servidor'}
                </p>
                <p>
                  <b>Interpretación:</b> {estado.ia === 'anthropic' ? `Claude (${estado.modeloIa})` : 'Reglas por palabras clave (sin IA)'}
                </p>
                <p className="flex items-center gap-1">
                  <Mic size={14} aria-hidden /> <b>Notas de voz:</b> {estado.transcripcion === 'openai' ? 'transcripción activa' : 'sin transcripción configurada'}
                </p>
                <p className="break-all text-xs text-tinta-soft">Webhook: {estado.webhook}</p>
                <p className="mt-1">
                  <b>Números autorizados</b> (administradores con WhatsApp habilitado):
                </p>
                {estado.numerosAutorizados.length ? (
                  <ul className="list-disc pl-5 tabular-nums">
                    {estado.numerosAutorizados.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-tinta-soft">Ninguno. Habilítalo en Empleados › editar administrador.</p>
                )}
              </>
            )}
          </section>
          <section className="sticker grid gap-2 p-5 text-tinta" aria-labelledby="t-descargas">
            <h2 id="t-descargas" className="flex items-center gap-2 font-extrabold">
              <Download size={18} aria-hidden /> Descargas rápidas
            </h2>
            {[
              ['Ventas de este mes', '/api/admin/reportes/ventas/pdf?periodo=este_mes'],
              ['Ventas del mes pasado', '/api/admin/reportes/ventas/pdf?periodo=mes_pasado'],
              ['Lo más vendido del mes', '/api/admin/reportes/productos_mas_vendidos/pdf?periodo=este_mes'],
              ['Inventario de todas las sedes', '/api/admin/reportes/inventario/pdf'],
            ].map(([t, href]) => (
              <a key={href} href={href} className="btn btn-blanco btn-sm justify-start">
                <FileText size={16} aria-hidden /> {t}
              </a>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}

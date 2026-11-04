'use client'

import { configPasaporteSchema, cop, type ConfigPasaporteDTO } from '@rejana/shared'
import { Stamp } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { api, ErrorApi, obtener } from '@/lib/api'

interface Producto {
  id: string
  nombre: string
  activo: boolean
}

export function PasaporteAdmin() {
  const { data, mutate } = useSWR<{ config: ConfigPasaporteDTO }>('/admin/pasaporte', obtener)
  const { data: catalogo } = useSWR<{ productos: Producto[] }>('/admin/catalogo', obtener)
  if (!data) return <div className="esqueleto h-96" />
  return <FormPasaporte key={JSON.stringify(data.config)} config={data.config} productos={(catalogo?.productos ?? []).filter((p) => p.activo)} onGuardado={() => void mutate()} />
}

function FormPasaporte({ config, productos, onGuardado }: { config: ConfigPasaporteDTO; productos: Producto[]; onGuardado: () => void }) {
  const [activo, setActivo] = useState(config.activo)
  const [sellos, setSellos] = useState(String(config.sellosParaPremio))
  const [minimo, setMinimo] = useState(String(config.montoMinimo))
  const [premio, setPremio] = useState(config.premioProductoId ?? '')
  const [descripcion, setDescripcion] = useState(config.premioDescripcion ?? '')
  const [vigencia, setVigencia] = useState(String(config.vigenciaMeses))
  const [guardando, setGuardando] = useState(false)

  return (
    <div className="grid gap-5">
      <div>
        <p className="acento text-lg">Fidelidad</p>
        <h1 className="titulo text-3xl">Pasaporte de sellos</h1>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Inscritos', config.estadisticas.inscritos],
          ['Sellos este mes', config.estadisticas.sellosMes],
          ['Premios este mes', config.estadisticas.canjesMes],
        ].map(([t, v]) => (
          <div key={t} className="rounded-2xl border-2 border-noche-700 bg-noche-950/40 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-noche-300">{t}</p>
            <p className="text-2xl font-black tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <form
        className="sticker grid max-w-xl gap-4 p-5 text-tinta"
        onSubmit={async (e) => {
          e.preventDefault()
          const r = configPasaporteSchema.safeParse({
            activo,
            sellosParaPremio: Number(sellos),
            montoMinimo: Number(minimo.replace(/\D/g, '')),
            premioProductoId: premio || null,
            premioDescripcion: descripcion.trim() || null,
            vigenciaMeses: Number(vigencia),
          })
          if (!r.success) {
            avisar(r.error.issues[0]?.message ?? 'Revisa los datos', 'error')
            return
          }
          setGuardando(true)
          try {
            await api('/admin/pasaporte', { metodo: 'PUT', cuerpo: r.data })
            avisar('Pasaporte guardado')
            onGuardado()
          } catch (err) {
            avisar(err instanceof ErrorApi ? err.message : 'No se pudo guardar', 'error')
          } finally {
            setGuardando(false)
          }
        }}
      >
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" className="h-5 w-5 accent-rosa" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <Stamp size={18} aria-hidden /> Programa activo
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="etiqueta">Sellos para el premio</span>
            <input className="campo" inputMode="numeric" value={sellos} onChange={(e) => setSellos(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="etiqueta">Compra mínima por sello</span>
            <input className="campo" inputMode="numeric" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
            <span className="text-xs text-tinta-soft">{cop(Number(minimo.replace(/\D/g, '')) || 0)} de consumo (sin domicilio ni propina)</span>
          </label>
        </div>
        <label className="grid gap-1">
          <span className="etiqueta">Premio</span>
          <select className="campo" value={premio} onChange={(e) => setPremio(e.target.value)}>
            <option value="">Elige un producto…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <span className="text-xs text-tinta-soft">Se entrega gratis desde la caja y la cocina lo prepara (descuenta inventario).</span>
        </label>
        <label className="grid gap-1">
          <span className="etiqueta">Descripción del premio (opcional)</span>
          <input className="campo" maxLength={140} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: un choriperro clásico de regalo" />
        </label>
        <label className="grid gap-1">
          <span className="etiqueta">Vigencia de cada sello (meses; 0 = no vencen)</span>
          <input className="campo" inputMode="numeric" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
        </label>
        <button className="btn btn-rosa btn-lg" disabled={guardando}>
          Guardar
        </button>
        <p className="text-xs text-tinta-soft">Los clientes activan su pasaporte con autorización expresa (Ley 1581). En la caja solo se ve su nombre de pila y sus sellos.</p>
      </form>
    </div>
  )
}

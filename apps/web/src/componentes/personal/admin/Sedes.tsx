'use client'

import { cop, sedeSchema, telefonoLegible, type SedePublicaDTO } from '@rejana/shared'
import { MapPin, Pencil, Plus, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'
import { MesasSede } from './MesasSede'

type SedeAdmin = SedePublicaDTO & { activa: boolean }

export function SedesAdmin() {
  const { data, mutate } = useSWR<{ sedes: SedeAdmin[] }>('/admin/sedes', obtener)
  const [editar, setEditar] = useState<SedeAdmin | 'nueva' | null>(null)
  const [mesasDe, setMesasDe] = useState<SedeAdmin | null>(null)
  return (
    <div className="grid gap-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="titulo text-3xl">Sedes</h1>
        <button className="btn btn-amarillo btn-sm" onClick={() => setEditar('nueva')}>
          <Plus size={16} aria-hidden /> Nueva sede
        </button>
      </div>
      {!data ? (
        <div className="esqueleto h-64" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.sedes.map((s) => (
            <article key={s.id} className="sticker p-5 text-tinta">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">
                    {s.nombre} {!s.activa && <span className="chip bg-rojo-100 text-rojo-600">inactiva</span>}
                  </h2>
                  <p className="flex items-center gap-1 text-sm text-tinta-soft">
                    <MapPin size={14} aria-hidden /> {s.direccion} · {s.barrio}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button className="btn btn-blanco btn-sm" onClick={() => setEditar(s)}>
                    <Pencil size={15} aria-hidden /> Editar<span className="sr-only"> la sede {s.nombre}</span>
                  </button>
                  <button className="btn btn-blanco btn-sm" onClick={() => setMesasDe(s)}>
                    <UtensilsCrossed size={15} aria-hidden /> Mesas<span className="sr-only"> de {s.nombre}</span>
                  </button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-tinta-soft">Horario</dt>
                <dd>
                  {s.horaApertura} – {s.horaCierre}
                </dd>
                <dt className="text-tinta-soft">Domicilio</dt>
                <dd>{cop(s.tarifaDomicilio)}</dd>
                <dt className="text-tinta-soft">Cobertura</dt>
                <dd>{s.radioEntregaKm} km</dd>
                <dt className="text-tinta-soft">Límite de entrega</dt>
                <dd>{s.limiteMinutosEntrega} min</dd>
                <dt className="text-tinta-soft">Teléfono</dt>
                <dd>{telefonoLegible(s.telefono)}</dd>
              </dl>
            </article>
          ))}
        </div>
      )}
      <Hoja abierta={!!mesasDe} onCerrar={() => setMesasDe(null)} titulo={`Mesas de ${mesasDe?.nombre ?? ''}`} ancho="max-w-xl">
        {mesasDe && <MesasSede sedeId={mesasDe.id} />}
      </Hoja>
      <Hoja abierta={!!editar} onCerrar={() => setEditar(null)} titulo={editar === 'nueva' ? 'Nueva sede' : `Editar sede ${editar?.nombre ?? ''}`} ancho="max-w-2xl">
        {editar && <FormSede sede={editar === 'nueva' ? null : editar} onListo={() => (setEditar(null), void mutate())} />}
      </Hoja>
    </div>
  )
}

function FormSede({ sede, onListo }: { sede: SedeAdmin | null; onListo: () => void }) {
  const [d, setD] = useState({
    nombre: sede?.nombre ?? '',
    direccion: sede?.direccion ?? '',
    barrio: sede?.barrio ?? '',
    telefono: sede ? telefonoLegible(sede.telefono) : '',
    lat: String(sede?.lat ?? 4.6886),
    lng: String(sede?.lng ?? -74.1094),
    horaApertura: sede?.horaApertura ?? '12:00',
    horaCierre: sede?.horaCierre ?? '22:00',
    tarifaDomicilio: String(sede?.tarifaDomicilio ?? 5000),
    limiteMinutosEntrega: String(sede?.limiteMinutosEntrega ?? 25),
    minutosPreparacion: String(sede?.minutosPreparacion ?? 20),
    radioEntregaKm: String(sede?.radioEntregaKm ?? 5),
    qrPagoUrl: sede?.qrPagoUrl ?? '',
    qrPagoInstrucciones: sede?.qrPagoInstrucciones ?? '',
    activa: sede?.activa ?? true,
  })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const campo = (k: keyof typeof d, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="grid gap-1">
      <span className="etiqueta">{etiqueta}</span>
      <input className="campo" value={String(d[k])} onChange={(e) => setD({ ...d, [k]: e.target.value })} {...extra} />
    </label>
  )
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        const r = sedeSchema.safeParse({
          ...d,
          lat: Number(d.lat),
          lng: Number(d.lng),
          tarifaDomicilio: Number(d.tarifaDomicilio),
          limiteMinutosEntrega: Number(d.limiteMinutosEntrega),
          minutosPreparacion: Number(d.minutosPreparacion),
          radioEntregaKm: Number(d.radioEntregaKm),
          qrPagoUrl: d.qrPagoUrl || null,
          qrPagoInstrucciones: d.qrPagoInstrucciones || null,
        })
        if (!r.success) return setError(`${String(r.error.issues[0]?.path[0])}: ${r.error.issues[0]?.message}`)
        setEnviando(true)
        try {
          await api(sede ? `/admin/sedes/${sede.id}` : '/admin/sedes', { metodo: sede ? 'PUT' : 'POST', cuerpo: r.data })
          avisar(sede ? 'Sede actualizada' : 'Sede creada')
          onListo()
        } catch (err) {
          setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar')
        } finally {
          setEnviando(false)
        }
      }}
    >
      {campo('nombre', 'Nombre', { required: true })}
      {campo('telefono', 'Teléfono', { inputMode: 'tel' })}
      {campo('direccion', 'Dirección')}
      {campo('barrio', 'Barrio')}
      {campo('lat', 'Latitud', { inputMode: 'decimal' })}
      {campo('lng', 'Longitud', { inputMode: 'decimal' })}
      {campo('horaApertura', 'Abre (HH:MM)')}
      {campo('horaCierre', 'Cierra (HH:MM)')}
      {campo('tarifaDomicilio', 'Tarifa de domicilio ($)', { inputMode: 'numeric' })}
      {campo('radioEntregaKm', 'Cobertura (km)', { inputMode: 'decimal' })}
      {campo('limiteMinutosEntrega', 'Límite de minutos por entrega', { inputMode: 'numeric' })}
      {campo('minutosPreparacion', 'Minutos de preparación', { inputMode: 'numeric' })}
      <div className="sm:col-span-2">{campo('qrPagoUrl', 'Imagen del QR de pago (URL https o /pagos/…)')}</div>
      <label className="grid gap-1 sm:col-span-2">
        <span className="etiqueta">Instrucciones del pago con QR</span>
        <textarea className="campo" maxLength={300} value={d.qrPagoInstrucciones} onChange={(e) => setD({ ...d, qrPagoInstrucciones: e.target.value })} />
      </label>
      <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2">
        <input type="checkbox" className="h-5 w-5 accent-rosa" checked={d.activa} onChange={(e) => setD({ ...d, activa: e.target.checked })} /> Sede activa (recibe pedidos)
      </label>
      {error && <p className="text-sm font-bold text-rojo-600 sm:col-span-2" role="alert">{error}</p>}
      <button className="btn btn-rosa btn-lg sm:col-span-2" disabled={enviando}>
        Guardar
      </button>
    </form>
  )
}

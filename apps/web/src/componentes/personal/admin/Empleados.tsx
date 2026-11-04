'use client'

import { fechaHora, NOMBRE_ROL, ROLES_EMPLEADO, telefonoLegible, type RolEmpleado, type SedePublicaDTO } from '@rejana/shared'
import { MailPlus, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'

interface Empleado {
  id: string
  nombre: string
  correo: string
  telefono: string | null
  rol: RolEmpleado
  sedeId: string | null
  sedeNombre: string | null
  activo: boolean
  whatsappHabilitado: boolean
  ultimoIngresoEn: string | null
}
interface Invitacion {
  id: string
  correo: string
  rol: RolEmpleado
  sedeNombre: string | null
  expiraEn: string
}

export function EmpleadosAdmin() {
  const { data, mutate } = useSWR<{ empleados: Empleado[] }>('/admin/empleados', obtener)
  const { data: inv, mutate: mutarInv } = useSWR<{ invitaciones: Invitacion[] }>('/admin/invitaciones', obtener)
  const { data: sedes } = useSWR<{ sedes: SedePublicaDTO[] }>('/sedes', obtener)
  const [editar, setEditar] = useState<Empleado | null>(null)

  return (
    <div className="grid gap-5">
      <h1 className="titulo text-3xl">Empleados</h1>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.6fr]">
        <section className="sticker p-5 text-tinta" aria-labelledby="t-invitar">
          <h2 id="t-invitar" className="flex items-center gap-2 font-extrabold">
            <MailPlus size={18} aria-hidden /> Invitar a alguien
          </h2>
          <FormInvitar sedes={sedes?.sedes ?? []} onListo={() => void mutarInv()} />
          {inv && inv.invitaciones.length > 0 && (
            <div className="mt-5">
              <h3 className="etiqueta">Invitaciones pendientes</h3>
              <ul className="grid gap-2">
                {inv.invitaciones.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{i.correo}</b>
                      <span className="text-xs text-tinta-soft">
                        {NOMBRE_ROL[i.rol]}
                        {i.sedeNombre ? ` · ${i.sedeNombre}` : ''} · vence {fechaHora(i.expiraEn)}
                      </span>
                    </span>
                    <button
                      className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5"
                      aria-label={`Revocar invitación de ${i.correo}`}
                      onClick={async () => {
                        try {
                          await api(`/admin/invitaciones/${i.id}`, { metodo: 'DELETE' })
                          avisar('Invitación revocada')
                          void mutarInv()
                        } catch (e) {
                          avisar(e instanceof ErrorApi ? e.message : 'No se pudo revocar', 'error')
                        }
                      }}
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="sticker overflow-x-auto p-4 text-tinta" aria-labelledby="t-equipo">
          <h2 id="t-equipo" className="font-extrabold">
            Equipo
          </h2>
          {!data ? (
            <div className="esqueleto-claro mt-3 h-40" />
          ) : (
            <table className="tabla tabla-apilable mt-2">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.empleados.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.nombre}</b>
                      <span className="block text-xs text-tinta-soft">{u.correo}</span>
                    </td>
                    <td data-label="Rol">
                      {NOMBRE_ROL[u.rol]}
                      {u.whatsappHabilitado ? ' · WhatsApp' : ''}
                    </td>
                    <td data-label="Sede">{u.sedeNombre ?? 'Todas'}</td>
                    <td data-label="Estado">{u.activo ? <span className="chip bg-verde-100 text-verde-700">Activo</span> : <span className="chip bg-rojo-100 text-rojo-600">Inactivo</span>}</td>
                    <td data-label="">
                      <button className="btn btn-blanco btn-sm !min-h-8" onClick={() => setEditar(u)} aria-label={`Editar a ${u.nombre}`}>
                        <Pencil size={15} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <Hoja abierta={!!editar} onCerrar={() => setEditar(null)} titulo={`Editar a ${editar?.nombre ?? ''}`}>
        {editar && <FormEmpleado empleado={editar} sedes={sedes?.sedes ?? []} onListo={() => (setEditar(null), void mutate())} />}
      </Hoja>
    </div>
  )
}

function SelectorRolSede({ rol, sedeId, sedes, onRol, onSede }: { rol: RolEmpleado; sedeId: string; sedes: SedePublicaDTO[]; onRol: (r: RolEmpleado) => void; onSede: (s: string) => void }) {
  return (
    <>
      <label className="grid gap-1">
        <span className="etiqueta">Rol</span>
        <select className="campo" value={rol} onChange={(e) => onRol(e.target.value as RolEmpleado)}>
          {ROLES_EMPLEADO.map((r) => (
            <option key={r} value={r}>
              {NOMBRE_ROL[r]}
            </option>
          ))}
        </select>
      </label>
      {rol !== 'admin' && (
        <label className="grid gap-1">
          <span className="etiqueta">Sede</span>
          <select className="campo" value={sedeId} onChange={(e) => onSede(e.target.value)}>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}

function FormInvitar({ sedes, onListo }: { sedes: SedePublicaDTO[]; onListo: () => void }) {
  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState<RolEmpleado>('cocina')
  const [sedeId, setSedeId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const sede = sedeId || sedes[0]?.id || ''
  return (
    <form
      className="mt-3 grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        try {
          await api('/admin/invitaciones', { metodo: 'POST', cuerpo: { correo, rol, sedeId: rol === 'admin' ? null : sede } })
          avisar(`Invitación enviada a ${correo}`)
          setCorreo('')
          onListo()
        } catch (err) {
          avisar(err instanceof ErrorApi ? err.message : 'No se pudo invitar', 'error')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <label className="grid gap-1">
        <span className="etiqueta">Correo del empleado</span>
        <input className="campo" type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="nombre@correo.com" />
      </label>
      <SelectorRolSede rol={rol} sedeId={sede} sedes={sedes} onRol={setRol} onSede={setSedeId} />
      <p className="text-xs text-tinta-soft">Le llega un enlace de un solo uso que vence en 72 horas. Solo ese correo puede aceptarlo (con contraseña, Google o Apple).</p>
      <button className="btn btn-rosa" disabled={enviando}>
        Enviar invitación
      </button>
    </form>
  )
}

function FormEmpleado({ empleado, sedes, onListo }: { empleado: Empleado; sedes: SedePublicaDTO[]; onListo: () => void }) {
  const [rol, setRol] = useState<RolEmpleado>(empleado.rol)
  const [sedeId, setSedeId] = useState(empleado.sedeId ?? sedes[0]?.id ?? '')
  const [activo, setActivo] = useState(empleado.activo)
  const [telefono, setTelefono] = useState(empleado.telefono ? telefonoLegible(empleado.telefono) : '')
  const [whatsapp, setWhatsapp] = useState(empleado.whatsappHabilitado)
  const [enviando, setEnviando] = useState(false)
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        try {
          const r = await api<{ empleado: { sesionesCerradas: boolean } }>(`/admin/empleados/${empleado.id}`, {
            metodo: 'PATCH',
            cuerpo: { rol, sedeId: rol === 'admin' ? null : sedeId, activo, telefono: telefono.trim() ? telefono : null, whatsappHabilitado: rol === 'admin' ? whatsapp : false },
          })
          avisar(r.empleado.sesionesCerradas ? 'Guardado. Cerramos sus sesiones para aplicar el cambio.' : 'Guardado')
          onListo()
        } catch (err) {
          avisar(err instanceof ErrorApi ? err.message : 'No se pudo guardar', 'error')
        } finally {
          setEnviando(false)
        }
      }}
    >
      <p className="text-sm text-tinta-soft">
        {empleado.correo}
        {empleado.ultimoIngresoEn ? ` · último ingreso ${fechaHora(empleado.ultimoIngresoEn)}` : ''}
      </p>
      <SelectorRolSede rol={rol} sedeId={sedeId} sedes={sedes} onRol={setRol} onSede={setSedeId} />
      <label className="grid gap-1">
        <span className="etiqueta">Celular</span>
        <input className="campo" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="300 123 4567" />
      </label>
      {rol === 'admin' && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-rosa" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
          <span>
            Puede usar el asistente de WhatsApp
            <span className="block text-xs text-tinta-soft">Solo responde a este celular (lista blanca).</span>
          </span>
        </label>
      )}
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-rosa" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Cuenta activa
      </label>
      <button className="btn btn-rosa btn-lg" disabled={enviando}>
        Guardar
      </button>
    </form>
  )
}

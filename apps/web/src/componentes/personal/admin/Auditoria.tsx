'use client'

import { fechaHora, NOMBRE_ROL, type Rol } from '@rejana/shared'
import { useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { obtener } from '@/lib/api'

interface Registro {
  id: string
  actorNombre: string | null
  actorRol: string | null
  accion: string
  entidad: string
  entidadId: string | null
  datos: Record<string, unknown> | null
  creadoEn: string
}

const ACCIONES: Record<string, string> = {
  'menu.cambio_precio': 'Cambió un precio',
  'menu.guardar': 'Actualizó el menú de una sede',
  'menu.quitar': 'Quitó un producto del menú',
  'receta.actualizar': 'Cambió una receta',
  'producto.crear': 'Creó un producto',
  'producto.actualizar': 'Editó un producto',
  'categoria.crear': 'Creó una categoría',
  'inventario.entrada': 'Registró una entrada de inventario',
  'inventario.ajuste': 'Hizo un conteo de inventario',
  'inventario.minimo': 'Cambió un stock mínimo',
  'insumo.crear': 'Creó un insumo',
  'insumo.actualizar': 'Editó un insumo',
  'sede.crear': 'Creó una sede',
  'sede.actualizar': 'Editó una sede',
  'empleado.actualizar': 'Cambió permisos de un empleado',
  'invitacion.crear': 'Invitó a un empleado',
  'invitacion.revocar': 'Revocó una invitación',
  'invitacion.aceptada': 'Aceptó su invitación',
  'pedido.cancelar': 'Canceló un pedido',
  'pedido.pago': 'Registró un pago',
  'pedido.cerrar': 'Cerró un pedido',
  'seguridad.bloqueo_temporal': 'Bloqueo por intentos fallidos',
  'seguridad.reuso_refresh': 'Sesión revocada por reuso de token',
}

function resumen(datos: Record<string, unknown> | null): string {
  if (!datos) return ''
  const partes: string[] = []
  for (const [k, v] of Object.entries(datos)) {
    if (v === null || v === undefined) continue
    partes.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  }
  return partes.join(' · ').slice(0, 220)
}

export function AuditoriaAdmin() {
  const [entidad, setEntidad] = useState('')
  const { data, size, setSize, isValidating } = useSWRInfinite<{ registros: Registro[] }>(
    (i, previo) => {
      if (previo && previo.registros.length < 100) return null
      const p = new URLSearchParams()
      if (entidad) p.set('entidad', entidad)
      if (i > 0 && previo) p.set('antesDe', previo.registros.at(-1)!.creadoEn)
      return `/admin/auditoria?${p}`
    },
    obtener,
  )
  const registros = data?.flatMap((d) => d.registros) ?? []
  const hayMas = data && data.at(-1)!.registros.length === 100

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="titulo text-3xl">Auditoría</h1>
        <label className="flex items-center gap-2 text-sm font-bold">
          <span className="text-noche-300">Filtrar</span>
          <select className="campo !min-h-10 !w-auto !py-1.5" value={entidad} onChange={(e) => setEntidad(e.target.value)}>
            <option value="">Todo</option>
            <option value="producto">Menú y precios</option>
            <option value="inventario">Inventario</option>
            <option value="usuario">Empleados</option>
            <option value="pedido">Pedidos</option>
            <option value="sede">Sedes</option>
          </select>
        </label>
      </div>
      <section className="sticker overflow-x-auto p-4 text-tinta">
        <table className="tabla tabla-apilable">
          <thead>
            <tr>
              <th>Cuándo</th>
              <th>Quién</th>
              <th>Qué</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fechaHora(r.creadoEn)}</td>
                <td data-label="Quién">
                  {r.actorNombre ?? 'Sistema'}
                  {r.actorRol && r.actorRol in NOMBRE_ROL ? <span className="block text-xs text-tinta-soft">{NOMBRE_ROL[r.actorRol as Rol]}</span> : null}
                </td>
                <td data-label="Qué">{ACCIONES[r.accion] ?? r.accion}</td>
                <td data-label="Detalle" className="max-w-md text-xs text-tinta-soft">
                  {resumen(r.datos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && !isValidating && <p className="py-6 text-center text-sm text-tinta-soft">Sin registros.</p>}
        {hayMas && (
          <button className="btn btn-blanco mt-4" onClick={() => void setSize(size + 1)} disabled={isValidating}>
            Cargar más
          </button>
        )}
      </section>
    </div>
  )
}

'use client'

import { cantidadInsumo, cop, NOMBRE_ESTADO, numero, type EstadoPedido, type Unidad } from '@rejana/shared'
import { TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRef } from 'react'
import useSWR from 'swr'
import { BarrasHorizontales } from '@/componentes/graficas/BarrasH'
import { pesosCompactos } from '@/componentes/graficas/formato'
import { Indicador } from '@/componentes/graficas/Indicador'
import { GraficaLineas } from '@/componentes/graficas/Lineas'
import { obtener } from '@/lib/api'
import { useTiempoReal } from '@/lib/tiempo-real'

interface DatosTablero {
  generadoEn: string
  sedes: { id: string; nombre: string }[]
  hoy: { ventas: number; pedidos: number; porSede: { sedeId: string; sedeNombre: string; ventas: number; pedidos: number }[] }
  mes: { etiqueta: string; ventas: number; pedidos: number; ticketPromedio: number; ventasComparables: number; pedidosComparables: number; porSede: { sedeId: string; sedeNombre: string; ventas: number; pedidos: number }[] }
  serie: { dias: string[]; porSede: { sedeId: string; sedeNombre: string; valores: number[] }[] }
  topProductos: { nombre: string; unidades: number; ventas: number }[]
  activos: Record<EstadoPedido, number>
  alertas: { sedeNombre: string; insumo: string; unidad: Unidad; cantidad: number; stockMinimo: number }[]
}

export function Tablero() {
  const { data, mutate, isValidating } = useSWR<DatosTablero>('/admin/tablero', obtener, { refreshInterval: 60_000 })
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  useTiempoReal({ activo: true }, {
    'pedido:actualizado': () => {
      // Agrupa ráfagas de eventos en una sola recarga.
      if (espera.current) clearTimeout(espera.current)
      espera.current = setTimeout(() => void mutate(), 1500)
    },
  })

  if (!data) {
    return (
      <div className="grid gap-4" aria-busy>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="esqueleto h-28" />
          ))}
        </div>
        <div className="esqueleto h-80" />
      </div>
    )
  }

  const variacion = data.mes.ventasComparables ? ((data.mes.ventas - data.mes.ventasComparables) / data.mes.ventasComparables) * 100 : null
  return (
    // Al recargar se conserva el dibujo anterior con menos opacidad (sin parpadeos).
    <div className={`grid gap-5 transition-opacity ${isValidating ? 'opacity-90' : ''}`}>
      <div>
        <p className="acento text-lg">{data.mes.etiqueta}</p>
        <h1 className="titulo text-3xl">Tablero</h1>
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores">
        <Indicador etiqueta="Ventas de hoy" valor={cop(data.hoy.ventas)} />
        <Indicador etiqueta="Pedidos de hoy" valor={numero(data.hoy.pedidos)} />
        <Indicador etiqueta="Ventas del mes" valor={cop(data.mes.ventas)} variacion={variacion} contexto="vs. los mismos días del mes pasado" />
        <Indicador etiqueta="Ticket promedio del mes" valor={cop(data.mes.ticketPromedio)} />
      </section>

      <section className="flex flex-wrap gap-2" aria-label="Pedidos activos ahora">
        {(['recibido', 'en_preparacion', 'listo', 'en_camino'] as EstadoPedido[]).map((e) => (
          <span key={e} className="chip border-2 border-noche-700 !px-3 !py-1.5 text-sm text-white">
            {NOMBRE_ESTADO[e]}: <b className="text-amarillo">{data.activos[e] ?? 0}</b>
          </span>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <GraficaLineas
          titulo="Ventas diarias por sede"
          descripcion="Últimos 30 días · pedidos no cancelados, en pesos · el último día va en curso"
          dias={data.serie.dias}
          series={data.serie.porSede.map((s) => ({ id: s.sedeId, nombre: s.sedeNombre, valores: s.valores }))}
          formato={pesosCompactos}
        />
        <BarrasHorizontales
          titulo="Lo más pedido del mes"
          descripcion="Unidades vendidas (todas las sedes)"
          nombreValor="Unidades"
          filas={data.topProductos.map((p) => ({ nombre: p.nombre, valor: p.unidades, detalle: cop(p.ventas) }))}
          formato={(v) => numero(v)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="sticker p-4 text-tinta" aria-labelledby="t-sedes">
          <h2 id="t-sedes" className="font-extrabold">
            Por sede
          </h2>
          <table className="tabla tabla-apilable mt-2">
            <thead>
              <tr>
                <th>Sede</th>
                <th className="num">Hoy</th>
                <th className="num">Pedidos hoy</th>
                <th className="num">Mes</th>
                <th className="num">Pedidos mes</th>
              </tr>
            </thead>
            <tbody>
              {data.mes.porSede.map((s) => {
                const h = data.hoy.porSede.find((x) => x.sedeId === s.sedeId)
                return (
                  <tr key={s.sedeId}>
                    <td className="font-bold">{s.sedeNombre}</td>
                    <td className="num" data-label="Hoy">
                      {cop(h?.ventas ?? 0)}
                    </td>
                    <td className="num" data-label="Pedidos hoy">
                      {h?.pedidos ?? 0}
                    </td>
                    <td className="num" data-label="Mes">
                      {cop(s.ventas)}
                    </td>
                    <td className="num" data-label="Pedidos mes">
                      {s.pedidos}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section className="sticker p-4 text-tinta" aria-labelledby="t-alertas">
          <div className="flex items-center justify-between">
            <h2 id="t-alertas" className="font-extrabold">
              Alertas de inventario
            </h2>
            <Link href="/admin/inventario" className="text-sm font-bold text-rosa-600 underline">
              Ir al inventario
            </Link>
          </div>
          {data.alertas.length === 0 ? (
            <p className="mt-3 text-sm text-tinta-soft">Todo el inventario está por encima de su mínimo.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {data.alertas.map((a) => (
                <li key={`${a.sedeNombre}-${a.insumo}`} className="flex items-center gap-2 text-sm">
                  <TriangleAlert size={16} style={{ color: '#d99a00' }} aria-hidden />
                  <span className="sr-only">Stock bajo:</span>
                  <b>{a.insumo}</b> en {a.sedeNombre}
                  <span className="ml-auto tabular-nums text-tinta-soft">
                    {cantidadInsumo(a.cantidad, a.unidad)} / mín. {cantidadInsumo(a.stockMinimo, a.unidad)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

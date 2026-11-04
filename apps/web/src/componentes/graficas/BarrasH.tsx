'use client'

import { useId, useState } from 'react'

export interface FilaBarra {
  nombre: string
  valor: number
  detalle?: string
}

/**
 * Barras horizontales ordenadas (una serie, un solo tono): grosor ≤ 24 px, punta redondeada de 4 px
 * y base recta, valor en la punta, tooltip por barra (también con teclado) y vista de tabla.
 */
export function BarrasHorizontales({ titulo, descripcion, filas, formato, nombreValor }: { titulo: string; descripcion?: string; filas: FilaBarra[]; formato: (v: number) => string; nombreValor: string }) {
  const [tabla, setTabla] = useState(false)
  const [activa, setActiva] = useState<number | null>(null)
  const idTitulo = useId()
  const ordenadas = [...filas].sort((a, b) => b.valor - a.valor)
  const maximo = Math.max(1, ...ordenadas.map((f) => f.valor))

  return (
    <figure className="viz sticker p-4 text-tinta" aria-labelledby={idTitulo}>
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p id={idTitulo} className="font-extrabold">
            {titulo}
          </p>
          {descripcion && <p className="text-xs text-tinta-soft">{descripcion}</p>}
        </div>
        <button className="btn btn-fantasma btn-sm !min-h-8 text-tinta underline" onClick={() => setTabla((t) => !t)} aria-pressed={tabla}>
          {tabla ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </figcaption>
      {ordenadas.length === 0 ? (
        <p className="mt-4 text-sm text-tinta-soft">Sin datos en este periodo.</p>
      ) : tabla ? (
        <table className="tabla mt-3">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="num">{nombreValor}</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => (
              <tr key={f.nombre}>
                <td>{f.nombre}</td>
                <td className="num">{formato(f.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="mt-3 grid gap-2.5">
          {ordenadas.map((f, i) => {
            const pct = (f.valor / maximo) * 100
            return (
              <li
                key={f.nombre}
                tabIndex={0}
                aria-label={`${f.nombre}: ${formato(f.valor)} ${nombreValor.toLowerCase()}${f.detalle ? `, ${f.detalle}` : ''}`}
                className="relative grid grid-cols-[minmax(0,38%)_1fr] items-center gap-3 rounded-lg outline-none focus-visible:outline-3 focus-visible:outline-amarillo"
                onPointerEnter={() => setActiva(i)}
                onPointerLeave={() => setActiva(null)}
                onFocus={() => setActiva(i)}
                onBlur={() => setActiva(null)}
              >
                <span className="truncate text-sm font-semibold">{f.nombre}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <svg className="h-5 min-w-0 flex-1 overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 20" aria-hidden>
                    <path
                      d={`M0,0 H${Math.max(0.5, pct - 1.6)} Q${pct},0 ${pct},4 V16 Q${pct},20 ${Math.max(0.5, pct - 1.6)},20 H0 Z`}
                      fill="var(--serie-1)"
                      opacity={activa === null || activa === i ? 1 : 0.55}
                    />
                  </svg>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">{formato(f.valor)}</span>
                </span>
                {activa === i && f.detalle && (
                  <span role="status" className="pointer-events-none absolute -top-9 right-0 z-10 rounded-xl border-2 border-tinta bg-white px-3 py-1 text-xs shadow-sticker-sm">
                    <b className="text-sm">{formato(f.valor)}</b> <span className="text-tinta-soft">{f.detalle}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </figure>
  )
}

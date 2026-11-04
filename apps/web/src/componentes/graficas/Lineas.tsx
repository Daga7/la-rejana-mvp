'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { escala, fechaCorta } from './formato'

export interface SerieLinea {
  id: string
  nombre: string
  valores: number[]
}

const COLORES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)']
const M = { arriba: 12, derecha: 96, abajo: 30, izquierda: 64 }

/**
 * Líneas para tendencias en el tiempo. Color por entidad (orden fijo, nunca por rango), un solo eje,
 * trazo de 2 px, punto final con anillo de superficie, crosshair con tooltip de todas las series,
 * navegación con teclado y vista de tabla.
 */
export function GraficaLineas({ titulo, descripcion, dias, series, formato, alto = 260 }: { titulo: string; descripcion?: string; dias: string[]; series: SerieLinea[]; formato: (v: number) => string; alto?: number }) {
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(640)
  const [indice, setIndice] = useState<number | null>(null)
  const [tabla, setTabla] = useState(false)
  const idTitulo = useId()

  useEffect(() => {
    if (!caja.current) return
    const obs = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.floor(e!.contentRect.width))))
    obs.observe(caja.current)
    return () => obs.disconnect()
  }, [])

  const n = dias.length
  const derecha = ancho < 420 ? 12 : M.derecha
  const anchoPlot = ancho - M.izquierda - derecha
  const altoPlot = alto - M.arriba - M.abajo
  const { tope, ticks } = escala(Math.max(1, ...series.flatMap((s) => s.valores)))
  const x = (i: number) => M.izquierda + (n <= 1 ? anchoPlot / 2 : (i * anchoPlot) / (n - 1))
  const y = (v: number) => M.arriba + altoPlot * (1 - v / tope)
  const camino = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const marcasX = n <= 1 ? [0] : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1]

  // Etiquetas directas al final, solo si no chocan (si chocan, quedan la leyenda y el tooltip).
  const finales = series.map((s, k) => ({ k, nombre: s.nombre, yFin: y(s.valores.at(-1) ?? 0) }))
  const chocan = derecha < 40 || finales.some((a, i) => finales.some((b, j) => i < j && Math.abs(a.yFin - b.yFin) < 16))

  function mover(ev: React.PointerEvent<SVGRectElement>) {
    const r = ev.currentTarget.getBoundingClientRect()
    const px = ev.clientX - r.left
    setIndice(Math.max(0, Math.min(n - 1, Math.round((px / r.width) * (n - 1)))))
  }

  const xTip = indice !== null ? x(indice) : 0

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
      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-4 text-xs font-semibold" aria-label="Leyenda">
          {series.map((s, k) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden>
                <line x1="1" y1="4" x2="17" y2="4" stroke={COLORES[k]} strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              {s.nombre}
            </li>
          ))}
        </ul>
      )}
      {tabla ? (
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Día</th>
                {series.map((s) => (
                  <th key={s.id} className="num">
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dias.map((d, i) => (
                <tr key={d}>
                  <td>{fechaCorta(d)}</td>
                  {series.map((s) => (
                    <td key={s.id} className="num">
                      {formato(s.valores[i] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={caja} className="relative mt-2">
          <svg
            width={ancho}
            height={alto}
            role="img"
            aria-label={`${titulo}. Usa las flechas para recorrer los días.`}
            tabIndex={0}
            className="block max-w-full overflow-visible outline-none focus-visible:outline-3 focus-visible:outline-amarillo"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setIndice((i) => Math.min(n - 1, (i ?? -1) + 1))
              else if (e.key === 'ArrowLeft') setIndice((i) => Math.max(0, (i ?? n) - 1))
              else if (e.key === 'Escape') setIndice(null)
            }}
            onBlur={() => setIndice(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.izquierda} x2={ancho - derecha} y1={y(t)} y2={y(t)} stroke="var(--viz-rejilla)" strokeWidth="1" />
                <text x={M.izquierda - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="tabular-nums" fontSize="11" fill="var(--viz-texto-2)">
                  {formato(t)}
                </text>
              </g>
            ))}
            {marcasX.map((i) => (
              <text key={i} x={x(i)} y={alto - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--viz-texto-2)">
                {fechaCorta(dias[i]!)}
              </text>
            ))}
            {series.map((s, k) => (
              <path key={s.id} d={camino(s.valores)} fill="none" stroke={COLORES[k]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s, k) => (
              <circle key={s.id} cx={x(n - 1)} cy={y(s.valores.at(-1) ?? 0)} r="4" fill={COLORES[k]} stroke="var(--viz-superficie)" strokeWidth="2" />
            ))}
            {!chocan &&
              finales.map((f) => (
                <text key={f.k} x={x(n - 1) + 10} y={f.yFin} dominantBaseline="middle" fontSize="12" fontWeight="600" fill="var(--viz-texto)">
                  {f.nombre}
                </text>
              ))}
            {indice !== null && (
              <g aria-hidden>
                <line x1={xTip} x2={xTip} y1={M.arriba} y2={M.arriba + altoPlot} stroke="var(--viz-texto-2)" strokeWidth="1" />
                {series.map((s, k) => (
                  <circle key={s.id} cx={xTip} cy={y(s.valores[indice] ?? 0)} r="4.5" fill={COLORES[k]} stroke="var(--viz-superficie)" strokeWidth="2" />
                ))}
              </g>
            )}
            <rect x={M.izquierda} y={M.arriba} width={Math.max(1, anchoPlot)} height={altoPlot} fill="transparent" onPointerMove={mover} onPointerLeave={() => setIndice(null)} />
          </svg>
          {indice !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-xl border-2 border-tinta bg-white px-3 py-2 text-xs shadow-sticker-sm"
              style={{ left: Math.min(Math.max(xTip + 12, 0), ancho - 170) }}
            >
              <p className="mb-1 text-tinta-soft">{fechaCorta(dias[indice]!)}</p>
              {series.map((s, k) => (
                <p key={s.id} className="flex items-center gap-2">
                  <svg width="12" height="6" aria-hidden>
                    <line x1="1" y1="3" x2="11" y2="3" stroke={COLORES[k]} strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <b className="text-sm text-tinta">{formato(s.valores[indice] ?? 0)}</b>
                  <span className="text-tinta-soft">{s.nombre}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

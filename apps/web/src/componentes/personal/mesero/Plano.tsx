'use client'

import type { MesaDTO } from '@rejana/shared'
import type { CSSProperties, ReactNode } from 'react'

type Lado = 'arriba' | 'abajo' | 'izq' | 'der'

/** Reparte los puestos alrededor de la mesa: en las rectangulares, a lo largo; en las demás, en los cuatro lados. */
function repartirSillas(m: Pick<MesaDTO, 'puestos' | 'forma' | 'ancho' | 'alto'>): Record<Lado, number> {
  const r: Record<Lado, number> = { arriba: 0, abajo: 0, izq: 0, der: 0 }
  const horizontal = m.ancho >= m.alto
  let s = Math.min(m.puestos, 12)
  if (m.forma === 'rectangular') {
    const largos: Lado[] = horizontal ? ['arriba', 'abajo'] : ['izq', 'der']
    const cortos: Lado[] = horizontal ? ['izq', 'der'] : ['arriba', 'abajo']
    const extremos = s >= 4 ? 2 : 0
    s -= extremos
    for (let i = 0; i < extremos; i++) r[cortos[i]!]++
    for (let i = 0; i < s; i++) r[largos[i % 2]!]++
    return r
  }
  const orden: Lado[] = ['izq', 'der', 'arriba', 'abajo']
  for (let i = 0; i < s; i++) r[orden[i % 4]!]++
  return r
}

function Sillas({ mesa, color }: { mesa: Pick<MesaDTO, 'puestos' | 'forma' | 'ancho' | 'alto'>; color: string }) {
  const reparto = repartirSillas(mesa)
  const sillas: ReactNode[] = []
  for (const lado of Object.keys(reparto) as Lado[]) {
    const k = reparto[lado]
    for (let i = 0; i < k; i++) {
      const t = ((i + 1) / (k + 1)) * 100
      const vertical = lado === 'izq' || lado === 'der'
      const largo = Math.min(30, 70 / k)
      const estilo: CSSProperties = vertical
        ? { top: `${t}%`, height: `${largo}%`, width: '12%', transform: 'translateY(-50%)', [lado === 'izq' ? 'left' : 'right']: 0 }
        : { left: `${t}%`, width: `${largo}%`, height: '12%', transform: 'translateX(-50%)', [lado === 'arriba' ? 'top' : 'bottom']: 0 }
      sillas.push(<span key={`${lado}${i}`} className="absolute rounded-[3px] border-[1.5px] border-tinta" style={{ ...estilo, background: color }} aria-hidden />)
    }
  }
  return <>{sillas}</>
}

const pos = (plano: { ancho: number; alto: number }, x: number, y: number, ancho: number, alto: number): CSSProperties => ({
  left: `${(x / plano.ancho) * 100}%`,
  top: `${(y / plano.alto) * 100}%`,
  width: `${(ancho / plano.ancho) * 100}%`,
  height: `${(alto / plano.alto) * 100}%`,
})

/** Tamaño visible del plano: lo que ocupan sus mesas más un margen (mínimo 12 × 8 casillas). */
export function tamanoPlano(mesas: Pick<MesaDTO, 'x' | 'y' | 'ancho' | 'alto'>[], extra = 1) {
  return {
    ancho: Math.min(24, Math.max(12, ...mesas.map((m) => m.x + m.ancho + extra))),
    alto: Math.min(24, Math.max(8, ...mesas.map((m) => m.y + m.alto + extra))),
  }
}

/**
 * Plano de una zona: cuadrícula de casillas con las mesas en su lugar. El contenido y el color de cada
 * mesa los decide quien lo usa (estado en el salón, selección en el editor). Si se pasa `onCasilla`, las
 * casillas libres se pueden tocar (para mover la mesa elegida).
 */
export function Plano<M extends MesaDTO>({
  mesas,
  plano,
  oscuro = false,
  claseMesa,
  contenido,
  etiquetaMesa,
  onMesa,
  seleccionadaId,
  onCasilla,
}: {
  mesas: M[]
  plano: { ancho: number; alto: number }
  oscuro?: boolean
  claseMesa: (m: M) => string
  contenido: (m: M) => ReactNode
  /** Nombre accesible extra (va después del contenido visible, solo para lectores de pantalla). */
  etiquetaMesa?: (m: M) => string
  onMesa: (m: M) => void
  seleccionadaId?: string | null
  onCasilla?: (x: number, y: number) => void
}) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border-2 border-tinta ${oscuro ? 'bg-noche-800' : 'bg-crema-50'}`}
      style={{
        aspectRatio: `${plano.ancho} / ${plano.alto}`,
        minWidth: `${plano.ancho * 1.75}rem`,
        backgroundImage: `radial-gradient(${oscuro ? 'rgba(255,255,255,.14)' : 'rgba(20,18,31,.14)'} 1.5px, transparent 1.5px)`,
        backgroundSize: `${100 / plano.ancho}% ${100 / plano.alto}%`,
      }}
    >
      {onCasilla &&
        Array.from({ length: plano.alto }, (_, y) =>
          Array.from({ length: plano.ancho }, (_, x) => (
            <button key={`${x}-${y}`} type="button" className="absolute rounded-md hover:bg-rosa/20 focus-visible:bg-rosa/30" style={pos(plano, x, y, 1, 1)} onClick={() => onCasilla(x, y)} aria-label={`Mover aquí: columna ${x + 1}, fila ${y + 1}`} />
          )),
        )}
      {mesas.map((m) => (
        <button key={m.id} type="button" onClick={() => onMesa(m)} className="group absolute" style={pos(plano, m.x, m.y, m.ancho, m.alto)} aria-pressed={seleccionadaId ? seleccionadaId === m.id : undefined}>
          <Sillas mesa={m} color={oscuro ? '#a3a8d1' : '#e4d3b0'} />
          <span
            className={`absolute grid place-items-center content-center border-2 border-tinta text-center leading-none transition group-active:scale-95 ${m.forma === 'redonda' ? 'rounded-full' : 'rounded-[10px]'} ${claseMesa(m)}`}
            style={{ inset: '14%', boxShadow: seleccionadaId === m.id ? '0 0 0 3px #fff, 0 0 0 6px #d81b72' : '2px 2px 0 0 #14121f' }}
          >
            {contenido(m)}
            {etiquetaMesa && <span className="sr-only">{etiquetaMesa(m)}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

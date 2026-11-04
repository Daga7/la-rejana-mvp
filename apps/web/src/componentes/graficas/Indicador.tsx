import { TrendingDown, TrendingUp } from 'lucide-react'

/** Stat tile: etiqueta, valor (cifras proporcionales) y variación opcional con ícono + texto. */
export function Indicador({ etiqueta, valor, variacion, contexto }: { etiqueta: string; valor: string; variacion?: number | null; contexto?: string }) {
  const sube = (variacion ?? 0) >= 0
  return (
    <div className="viz rounded-2xl border-2 border-tinta bg-crema p-4 text-tinta shadow-sticker-sm">
      <p className="text-sm font-semibold text-tinta-soft">{etiqueta}</p>
      <p className="mt-1 text-3xl font-semibold leading-tight">{valor}</p>
      {variacion !== undefined && variacion !== null && Number.isFinite(variacion) && (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-tinta-soft">
          {sube ? <TrendingUp size={14} style={{ color: 'var(--estado-bien)' }} aria-hidden /> : <TrendingDown size={14} style={{ color: 'var(--estado-critico)' }} aria-hidden />}
          <span>
            {sube ? 'Sube' : 'Baja'} {Math.abs(Math.round(variacion))} %{contexto ? ` ${contexto}` : ''}
          </span>
        </p>
      )}
    </div>
  )
}

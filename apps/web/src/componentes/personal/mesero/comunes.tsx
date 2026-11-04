import { NOMBRE_ESTADO_MESA, NOMBRE_ESTADO_MESA_RONDA, type EstadoMesa, type EstadoPedido } from '@rejana/shared'

/** Colores del plano: cada estado lleva también su texto (nunca solo el color). */
export const ESTILO_MESA: Record<EstadoMesa, string> = {
  libre: 'bg-white text-tinta',
  ocupada: 'bg-turquesa text-tinta',
  para_servir: 'bg-amarillo text-tinta animate-latido',
  por_cobrar: 'bg-rosa-500 text-white',
}

export function LeyendaMesas() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-noche-300" aria-label="Convenciones del plano">
      {(Object.keys(NOMBRE_ESTADO_MESA) as EstadoMesa[]).map((e) => (
        <li key={e} className="flex items-center gap-1.5">
          <span className={`h-4 w-4 rounded-md border-2 border-tinta ${ESTILO_MESA[e].replace('animate-latido', '')}`} aria-hidden />
          {NOMBRE_ESTADO_MESA[e]}
        </li>
      ))}
    </ul>
  )
}

const COLOR_RONDA: Record<EstadoPedido, string> = {
  recibido: 'bg-azul-100 text-azul',
  en_preparacion: 'bg-naranja-100 text-naranja-700',
  listo: 'bg-amarillo text-tinta',
  en_camino: 'bg-crema-200 text-tinta',
  entregado: 'bg-verde-100 text-verde-700',
  cancelado: 'bg-rojo-100 text-rojo-600 line-through',
}

export function ChipRonda({ estado }: { estado: EstadoPedido }) {
  return <span className={`chip border-2 border-tinta/20 ${COLOR_RONDA[estado]}`}>{NOMBRE_ESTADO_MESA_RONDA[estado]}</span>
}

/** Vibración corta en el celular del mesero (si el navegador la permite). */
export function vibrar() {
  try {
    navigator.vibrate?.([120, 60, 120])
  } catch {
    // Sin vibración: el aviso visual basta.
  }
}

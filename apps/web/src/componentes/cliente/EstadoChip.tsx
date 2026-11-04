import { NOMBRE_ESTADO, type EstadoPedido } from '@rejana/shared'

const COLOR: Record<EstadoPedido, string> = {
  recibido: 'bg-azul-100 text-azul',
  en_preparacion: 'bg-naranja-100 text-naranja',
  listo: 'bg-amarillo-100 text-amarillo-600',
  en_camino: 'bg-turquesa-100 text-turquesa-600',
  entregado: 'bg-verde-100 text-verde',
  cancelado: 'bg-rojo-100 text-rojo-600',
}

export function EstadoChip({ estado }: { estado: EstadoPedido }) {
  return <span className={`chip border-2 border-current/30 ${COLOR[estado]}`}>{NOMBRE_ESTADO[estado]}</span>
}

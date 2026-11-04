import type { MenuDTO, SedePublicaDTO } from '@rejana/shared'
import type { Metadata } from 'next'
import { DatosIniciales } from '@/componentes/DatosIniciales'
import { Tienda } from '@/componentes/cliente/Tienda'
import { obtenerEnServidor } from '@/lib/api-servidor'

export const metadata: Metadata = { title: 'Menú a domicilio' }

// El menú llega ya renderizado en el HTML (sede por defecto: la primera abierta). En conexiones lentas
// se ve sin esperar el JavaScript ni dos idas y vueltas a la API; luego SWR lo mantiene al día.
export default async function Menu() {
  const datos = await obtenerEnServidor<{ sedes: SedePublicaDTO[] }>('/sedes')
  const sede = datos?.sedes.find((s) => s.abierta) ?? datos?.sedes[0]
  const menu = sede ? await obtenerEnServidor<MenuDTO>(`/sedes/${sede.id}/menu`) : null

  const fallback: Record<string, unknown> = {}
  if (datos) fallback['/sedes'] = datos
  if (sede && menu) fallback[`/sedes/${sede.id}/menu`] = menu

  return (
    <DatosIniciales fallback={fallback}>
      <Tienda />
    </DatosIniciales>
  )
}

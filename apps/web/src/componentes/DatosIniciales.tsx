'use client'

import { useEffect, useState } from 'react'
import { SWRConfig } from 'swr'

// true hasta que la página termina su primera carga: solo entonces los datos del HTML son recién consultados.
let esCargaInicial = true

/**
 * Datos que el servidor acaba de consultar. En la carga inicial SWR los usa sin volver a pedirlos al montar
 * (`revalidateIfStale: false`); si se vuelve a esta pantalla navegando dentro de la app, revalida como
 * siempre. Las claves sin datos iniciales se consultan, y las actualizaciones periódicas siguen igual.
 */
export function DatosIniciales({ fallback, children }: { fallback: Record<string, unknown>; children: React.ReactNode }) {
  const [frescos] = useState(esCargaInicial)
  useEffect(() => {
    esCargaInicial = false
  }, [])
  return <SWRConfig value={{ fallback, revalidateIfStale: !frescos }}>{children}</SWRConfig>
}

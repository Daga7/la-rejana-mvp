'use client'

import { createContext, useContext } from 'react'

/** Configuración pública que se lee en tiempo de ejecución en el servidor (no se hornea en el build). */
export interface ConfigPublica {
  teselasUrl: string
  atribucionMapa: string
}

const Contexto = createContext<ConfigPublica>({
  teselasUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  atribucionMapa: '© OpenStreetMap',
})

export function ProveedorConfig({ valor, children }: { valor: ConfigPublica; children: React.ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export const useConfigPublica = () => useContext(Contexto)

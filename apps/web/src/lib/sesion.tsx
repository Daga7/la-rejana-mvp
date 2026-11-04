'use client'

import type { UsuarioDTO } from '@rejana/shared'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, haySesionProbable } from './api'

interface ContextoSesion {
  usuario: UsuarioDTO | null
  cargando: boolean
  recargar: () => Promise<UsuarioDTO | null>
  salir: () => Promise<void>
  establecer: (u: UsuarioDTO | null) => void
}

const Contexto = createContext<ContextoSesion | null>(null)

/** Consulta la sesión actual sin tocar estado de React. */
async function consultarSesion(): Promise<UsuarioDTO | null> {
  if (!haySesionProbable()) return null
  try {
    const r = await api<{ usuario: UsuarioDTO }>('/auth/yo')
    return r.usuario
  } catch {
    return null
  }
}

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioDTO | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    const u = await consultarSesion()
    setUsuario(u)
    setCargando(false)
    return u
  }, [])

  const salir = useCallback(async () => {
    try {
      await api('/auth/salir', { metodo: 'POST' })
    } finally {
      setUsuario(null)
    }
  }, [])

  useEffect(() => {
    let activo = true
    void consultarSesion().then((u) => {
      if (!activo) return
      setUsuario(u)
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [])

  const valor = useMemo(() => ({ usuario, cargando, recargar, salir, establecer: setUsuario }), [usuario, cargando, recargar, salir])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): ContextoSesion {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>')
  return c
}

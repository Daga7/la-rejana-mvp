'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Manejadores = Record<string, (datos: any) => void>

/**
 * Tiempo real por Server-Sent Events, mismo origen que la web: la cookie de sesión ya autentica
 * (sin ticket aparte). `EventSource` reconecta solo si la conexión se corta (p. ej. el límite de
 * duración de la función serverless); cae a sondeo con SWR mientras tanto, igual que antes.
 */
export function useTiempoReal(opciones: { pedidoId?: string; tokenSeguimiento?: string | null; activo?: boolean }, manejadores: Manejadores) {
  const [conectado, setConectado] = useState(false)
  const refFuente = useRef<EventSource | null>(null)
  const refManejadores = useRef(manejadores)
  useEffect(() => {
    refManejadores.current = manejadores
  })

  const activo = opciones.activo ?? true
  useEffect(() => {
    if (!activo) return
    const parametros = new URLSearchParams()
    if (opciones.pedidoId) parametros.set('pedidoId', opciones.pedidoId)
    if (opciones.tokenSeguimiento) parametros.set('token', opciones.tokenSeguimiento)
    const fuente = new EventSource(`/api/realtime/stream?${parametros}`, { withCredentials: true })
    refFuente.current = fuente
    fuente.onopen = () => setConectado(true)
    fuente.onerror = () => setConectado(false)
    const conExtra = fuente as EventSource & { _manejadores?: Record<string, (ev: MessageEvent) => void> }
    conExtra._manejadores = {}
    const agregar = (evento: string) => {
      const manejador = (ev: MessageEvent) => refManejadores.current[evento]?.(ev.data ? JSON.parse(ev.data) : undefined)
      conExtra._manejadores![evento] = manejador
      fuente.addEventListener(evento, manejador)
    }
    for (const evento of ['conectado', 'pedido:actualizado', 'pedido:estado', 'pedido:ubicacion', 'pedido:ubicacion-fin', 'inventario:bajo', 'cuenta:actualizada']) agregar(evento)
    return () => {
      refFuente.current = null
      fuente.close()
    }
  }, [activo, opciones.pedidoId, opciones.tokenSeguimiento])

  /** Las acciones del domiciliario (compartir ubicación) van por REST; no hay ack de socket en SSE. */
  const emitir = useCallback(async <T,>(): Promise<T | null> => null, [])

  return { conectado, emitir }
}

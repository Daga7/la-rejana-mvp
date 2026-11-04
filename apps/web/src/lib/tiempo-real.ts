'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { api } from './api'
import { useConfigPublica } from './config-publica'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Manejadores = Record<string, (datos: any) => void>

/**
 * Conexión Socket.IO autenticada con un ticket corto que se pide en cada (re)conexión.
 * Reconecta sola y cae a long-polling si el WebSocket no pasa (conexiones inestables).
 */
export function useTiempoReal(opciones: { pedidoId?: string; tokenSeguimiento?: string | null; activo?: boolean }, manejadores: Manejadores) {
  const { tiempoRealUrl } = useConfigPublica()
  const [conectado, setConectado] = useState(false)
  const refSocket = useRef<Socket | null>(null)
  const refManejadores = useRef(manejadores)
  useEffect(() => {
    refManejadores.current = manejadores
  })

  const activo = opciones.activo ?? true
  useEffect(() => {
    if (!activo || !tiempoRealUrl) return
    const socket: Socket = io(tiempoRealUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10_000,
      auth: (cb) => {
        api<{ ticket: string }>('/realtime/ticket', {
          metodo: 'POST',
          cuerpo: opciones.pedidoId ? { pedidoId: opciones.pedidoId } : {},
          cabeceras: opciones.tokenSeguimiento ? { 'x-pedido-token': opciones.tokenSeguimiento } : {},
        })
          .then((r) => cb({ ticket: r.ticket }))
          .catch(() => cb({ ticket: '' }))
      },
    })
    refSocket.current = socket
    socket.on('connect', () => setConectado(true))
    socket.on('disconnect', () => setConectado(false))
    socket.onAny((evento: string, datos: unknown) => refManejadores.current[evento]?.(datos))
    return () => {
      refSocket.current = null
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [activo, tiempoRealUrl, opciones.pedidoId, opciones.tokenSeguimiento])

  /** Emite un evento con confirmación (ack). Devuelve null si no hay conexión o no responde a tiempo. */
  const emitir = useCallback(<T,>(evento: string, datos: unknown, ms = 5000): Promise<T | null> => {
    const s = refSocket.current
    if (!s?.connected) return Promise.resolve(null)
    return s
      .timeout(ms)
      .emitWithAck(evento, datos)
      .then((r: T) => r)
      .catch(() => null)
  }, [])

  return { conectado, emitir }
}

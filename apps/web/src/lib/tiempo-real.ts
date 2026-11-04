'use client'

import { useEffect, useRef, useState } from 'react'
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
    socket.on('connect', () => setConectado(true))
    socket.on('disconnect', () => setConectado(false))
    socket.onAny((evento: string, datos: unknown) => refManejadores.current[evento]?.(datos))
    return () => {
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [activo, tiempoRealUrl, opciones.pedidoId, opciones.tokenSeguimiento])

  return { conectado }
}

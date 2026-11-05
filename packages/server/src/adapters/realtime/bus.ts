import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import type { Logger } from '../../ports/servicios'

export interface MensajeTiempoReal {
  /** Sala (canal de broadcast). */
  topic: string
  event: string
  payload: unknown
}

/**
 * Transporte de eventos en tiempo real: publica (HTTP, sin conexión persistente — sirve desde cualquier
 * función serverless) y suscribe (WebSocket, solo lo abre el propio backend con la llave de servicio;
 * el navegador nunca se conecta directo a Supabase). `suscribir` devuelve la función para cancelar.
 */
export interface BusEventos {
  publicar(mensajes: MensajeTiempoReal[]): Promise<void>
  suscribir(salas: string[], al: (m: MensajeTiempoReal) => void): () => void
}

const EVENTOS = ['pedido:actualizado', 'pedido:estado', 'pedido:ubicacion', 'pedido:ubicacion-fin', 'inventario:bajo', 'cuenta:actualizada'] as const

export function busSupabase(cfg: { url?: string; claveServicio?: string }, log: Logger): BusEventos {
  if (!cfg.url || !cfg.claveServicio) {
    log.warn({}, 'Tiempo real desactivado: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (la web se actualiza por sondeo)')
    return { publicar: async () => undefined, suscribir: () => () => undefined }
  }
  const url = cfg.url
  const claveServicio = cfg.claveServicio
  const destinoBroadcast = `${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`
  const cliente = createClient(url, claveServicio, { realtime: { params: { eventsPerSecond: 20 } } })

  return {
    async publicar(mensajes) {
      if (mensajes.length === 0) return
      const r = await fetch(destinoBroadcast, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: claveServicio, authorization: `Bearer ${claveServicio}` },
        body: JSON.stringify({ messages: mensajes.map((m) => ({ ...m, private: false })) }),
        signal: AbortSignal.timeout(4000),
      })
      if (!r.ok) throw new Error(`Supabase Realtime respondió ${r.status}`)
    },

    suscribir(salas, al) {
      const canales: RealtimeChannel[] = salas.map((sala) => {
        let canal = cliente.channel(sala, { config: { private: false } })
        for (const event of EVENTOS) canal = canal.on('broadcast', { event }, (m) => al({ topic: sala, event, payload: m.payload }))
        canal.subscribe((estado, error) => {
          if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') log.warn({ sala, err: error?.message }, 'No se pudo suscribir al canal de tiempo real')
        })
        return canal
      })
      return () => {
        for (const canal of canales) void cliente.removeChannel(canal)
      }
    },
  }
}

/** Bus en memoria del proceso: desarrollo sin Supabase configurado y pruebas de integración. */
export function busLocal(): BusEventos {
  const oyentes = new Map<string, Set<(m: MensajeTiempoReal) => void>>()
  return {
    async publicar(mensajes) {
      for (const m of mensajes) for (const al of oyentes.get(m.topic) ?? []) al(m)
    },
    suscribir(salas, al) {
      for (const sala of salas) (oyentes.get(sala) ?? oyentes.set(sala, new Set()).get(sala)!).add(al)
      return () => {
        for (const sala of salas) oyentes.get(sala)?.delete(al)
      }
    },
  }
}

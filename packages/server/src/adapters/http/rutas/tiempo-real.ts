import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import type { MensajeTiempoReal } from '../../realtime/bus'
import { actorDe } from '../servidor'
import type { Router } from '../router'

const CODIFICADOR = new TextEncoder()
const sse = (evento: string, datos: unknown) => CODIFICADOR.encode(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`)

/**
 * Tiempo real por Server-Sent Events: mismo origen que la web (la cookie de sesión ya autentica, sin
 * necesidad de un ticket aparte). El propio backend abre la suscripción a Supabase Realtime y la reenvía
 * al navegador; este nunca se conecta directo a Supabase.
 */
export function rutasTiempoReal(app: Router, c: Contenedor) {
  app.get('/api/realtime/stream', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const actor = await actorDe(req, c, c.env)
    const q = z.object({ pedidoId: z.string().optional() }).parse(req.query)
    const tokenSeguimiento = (() => {
      const t = req.query.token
      return typeof t === 'string' && t.length < 200 ? t : null
    })()
    const salas = await c.casos.push.salasTiempoReal(actor, q.pedidoId, tokenSeguimiento)

    let cancelar: (() => void) | null = null
    let latido: ReturnType<typeof setInterval> | null = null
    const stream = new ReadableStream<Uint8Array>({
      start(controlador) {
        controlador.enqueue(sse('conectado', { salas }))
        cancelar = c.bus.suscribir(salas, (m: MensajeTiempoReal) => {
          try {
            controlador.enqueue(sse(m.event, m.payload))
          } catch {
            // El controlador ya se cerró (el cliente se desconectó entre el evento y el enqueue).
          }
        })
        // Mantiene viva la conexión a través de proxies/balanceadores que cortan los sockets inactivos.
        latido = setInterval(() => {
          try {
            controlador.enqueue(CODIFICADOR.encode(': ping\n\n'))
          } catch {
            /* ignorar */
          }
        }, 20_000)
      },
      cancel() {
        cancelar?.()
        if (latido) clearInterval(latido)
      },
    })

    return reply
      .header('content-type', 'text/event-stream')
      .header('cache-control', 'no-store')
      .header('connection', 'keep-alive')
      .header('x-accel-buffering', 'no')
      .stream(stream)
  })
}

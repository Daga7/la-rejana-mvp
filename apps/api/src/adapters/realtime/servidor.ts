import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'
import type { ClaimsTicket, EmisorTokens, Logger } from '../../ports/servicios'

export type ManejadorSocket = (socket: Socket, claims: ClaimsTicket) => void

/**
 * Servidor Socket.IO sobre el mismo servidor HTTP de la API. Cada conexión se autentica con un
 * ticket JWT corto emitido por REST (no depende de cookies de terceros) y solo entra a sus salas.
 */
export function crearServidorTiempoReal(app: FastifyInstance, opciones: { origenes: string[]; tokens: EmisorTokens; log: Logger; manejadores: ManejadorSocket[] }) {
  const io = new Server(app.server, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: opciones.origenes, credentials: false, methods: ['GET', 'POST'] },
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 16 * 1024,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: false },
  })

  io.use(async (socket, next) => {
    const ticket = (socket.handshake.auth as { ticket?: unknown } | undefined)?.ticket
    if (typeof ticket !== 'string' || ticket.length > 2000) return next(new Error('no autorizado'))
    try {
      socket.data.claims = await opciones.tokens.verificarTicket(ticket)
      next()
    } catch {
      next(new Error('no autorizado'))
    }
  })

  io.on('connection', (socket) => {
    const claims = socket.data.claims as ClaimsTicket
    for (const sala of claims.salas) void socket.join(sala)
    for (const m of opciones.manejadores) m(socket, claims)
  })

  app.addHook('onClose', async () => {
    await new Promise<void>((r) => io.close(() => r()))
  })
  opciones.log.info({}, 'Tiempo real listo (Socket.IO)')
  return io
}

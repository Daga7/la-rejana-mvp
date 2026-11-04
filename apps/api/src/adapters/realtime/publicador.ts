import type { PedidoDTO, UbicacionEnVivoDTO } from '@rejana/shared'
import type { Server } from 'socket.io'
import type { PublicadorEventos } from '../../ports/servicios'

export const salas = {
  pedido: (id: string) => `pedido:${id}`,
  sede: (id: string) => `sede:${id}`,
  /** Meseros de la sede: solo rondas y cuentas de mesa, nunca domicilios. */
  mesas: (id: string) => `mesas:${id}`,
  domiciliario: (id: string) => `domiciliario:${id}`,
  admin: 'admin',
}

/**
 * Publicador de eventos sobre Socket.IO. Se crea antes que el servidor de sockets y se conecta
 * después (`conectar`); mientras tanto los eventos se descartan.
 */
export class PublicadorSocketIo implements PublicadorEventos {
  private io: Server | null = null

  conectar(io: Server) {
    this.io = io
  }

  pedidoActualizado(p: PedidoDTO) {
    if (!this.io) return
    if (p.canal === 'mesa') {
      // Rondas de mesa: cocina, caja y admin de la sede, y los meseros de la sede.
      this.io.to(salas.sede(p.sedeId)).to(salas.admin).to(salas.mesas(p.sedeId)).emit('pedido:actualizado', p)
      return
    }
    // Personal de la sede y administradores: pedido completo.
    this.io.to(salas.sede(p.sedeId)).to(salas.admin).emit('pedido:actualizado', p)
    if (p.domiciliarioId) this.io.to(salas.domiciliario(p.domiciliarioId)).emit('pedido:actualizado', p)
    // Cliente que sigue su pedido: solo lo que necesita ver.
    this.io.to(salas.pedido(p.id)).emit('pedido:estado', { id: p.id, estado: p.estado, actualizadoEn: p.actualizadoEn, etaMinutos: p.etaMinutos })
  }

  cuentaActualizada(sedeId: string, cuentaId: string) {
    this.io?.to(salas.sede(sedeId)).to(salas.admin).to(salas.mesas(sedeId)).emit('cuenta:actualizada', { sedeId, cuentaId })
  }

  ubicacion(pedidoId: string, datos: UbicacionEnVivoDTO) {
    this.io?.to(salas.pedido(pedidoId)).emit('pedido:ubicacion', datos)
  }

  finUbicacion(pedidoId: string) {
    this.io?.to(salas.pedido(pedidoId)).emit('pedido:ubicacion-fin', { pedidoId })
  }

  inventarioBajo(sedeId: string, datos: { insumoId: string; insumoNombre: string; cantidad: number; stockMinimo: number }) {
    this.io?.to(salas.sede(sedeId)).to(salas.admin).emit('inventario:bajo', { sedeId, ...datos })
  }

  menuCambio(sedeId: string) {
    this.io?.emit('menu:cambio', { sedeId })
  }
}

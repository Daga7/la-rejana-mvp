import type { PedidoDTO, UbicacionEnVivoDTO } from '@rejana/shared'
import type { Logger, PublicadorEventos } from '../../ports/servicios'
import type { BusEventos } from './bus'

export const salas = {
  pedido: (id: string) => `pedido:${id}`,
  sede: (id: string) => `sede:${id}`,
  /** Meseros de la sede: solo rondas y cuentas de mesa, nunca domicilios. */
  mesas: (id: string) => `mesas:${id}`,
  domiciliario: (id: string) => `domiciliario:${id}`,
  admin: 'admin',
}

/**
 * Publicador de eventos sobre Supabase Realtime (broadcast a canales privados). Los puertos de eventos son
 * síncronos y «dispara y olvida»: los envíos quedan pendientes y la capa HTTP los espera (`vaciar`) antes de
 * responder, para que la función serverless no se congele con mensajes a medias. Un fallo nunca rompe la operación.
 */
export class PublicadorSupabase implements PublicadorEventos {
  private pendientes = new Set<Promise<void>>()

  constructor(
    private readonly bus: BusEventos,
    private readonly log: Logger,
  ) {}

  private emitir(salasDestino: string[], event: string, payload: unknown) {
    const mensajes = [...new Set(salasDestino)].map((topic) => ({ topic, event, payload }))
    if (mensajes.length === 0) return
    const p: Promise<void> = this.bus
      .publicar(mensajes)
      .catch((e: unknown) => this.log.warn({ err: (e as Error).message }, 'No se pudo publicar un evento en tiempo real'))
      .finally(() => this.pendientes.delete(p))
    this.pendientes.add(p)
  }

  /** Espera los envíos en curso. */
  async vaciar() {
    while (this.pendientes.size > 0) await Promise.allSettled([...this.pendientes])
  }

  pedidoActualizado(p: PedidoDTO) {
    if (p.canal === 'mesa') {
      // Rondas de mesa: cocina, caja y admin de la sede, y los meseros de la sede.
      this.emitir([salas.sede(p.sedeId), salas.admin, salas.mesas(p.sedeId)], 'pedido:actualizado', p)
      return
    }
    // Personal de la sede y administradores: pedido completo.
    this.emitir([salas.sede(p.sedeId), salas.admin, ...(p.domiciliarioId ? [salas.domiciliario(p.domiciliarioId)] : [])], 'pedido:actualizado', p)
    // Cliente que sigue su pedido: solo lo que necesita ver.
    this.emitir([salas.pedido(p.id)], 'pedido:estado', { id: p.id, estado: p.estado, actualizadoEn: p.actualizadoEn, etaMinutos: p.etaMinutos })
  }

  cuentaActualizada(sedeId: string, cuentaId: string) {
    this.emitir([salas.sede(sedeId), salas.admin, salas.mesas(sedeId)], 'cuenta:actualizada', { sedeId, cuentaId })
  }

  ubicacion(pedidoId: string, datos: UbicacionEnVivoDTO) {
    this.emitir([salas.pedido(pedidoId)], 'pedido:ubicacion', datos)
  }

  finUbicacion(pedidoId: string) {
    this.emitir([salas.pedido(pedidoId)], 'pedido:ubicacion-fin', { pedidoId })
  }

  inventarioBajo(sedeId: string, datos: { insumoId: string; insumoNombre: string; cantidad: number; stockMinimo: number }) {
    this.emitir([salas.sede(sedeId), salas.admin], 'inventario:bajo', { sedeId, ...datos })
  }

  menuCambio(sedeId: string) {
    // Ninguna pantalla escucha el cambio de menú (se lee con SWR al entrar); se mantiene el puerto por compatibilidad.
    void sedeId
  }
}

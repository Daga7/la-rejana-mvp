import { ErrorDominio, err } from '../domain/errores'
import type { Actor } from '../domain/permisos'
import type { UnidadDeTrabajo } from '../ports/repositorios'
import type { Notificador } from '../ports/servicios'
import type { CasosPedidos } from './pedidos'

// La API envía un POST a la URL de la suscripción: solo se aceptan servicios push conocidos (evita SSRF).
const SERVICIOS_PUSH = [/^fcm\.googleapis\.com$/, /\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/]

export function endpointPushPermitido(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.port && SERVICIOS_PUSH.some((r) => r.test(u.hostname))
  } catch {
    return false
  }
}

export function crearCasosPush(d: { uow: UnidadDeTrabajo; push: Notificador; pedidos: CasosPedidos }) {
  const { uow } = d
  return {
    clavePublica: () => d.push.clavePublica,

    async suscribir(actor: Actor, e: { endpoint: string; keys: { p256dh: string; auth: string }; pedidoId?: string }, tokenSeguimiento: string | null) {
      if (!endpointPushPermitido(e.endpoint)) throw new ErrorDominio('VALIDACION', 'Servicio de notificaciones no soportado')
      if (e.pedidoId) {
        const p = await uow.repos.pedidos.porId(e.pedidoId)
        if (!p || !d.pedidos.puedeVer(actor, p, tokenSeguimiento)) throw err.noEncontrado('No encontramos ese pedido')
      } else if (actor.tipo !== 'usuario') throw err.noAutenticado()
      const s = await uow.repos.suscripciones.guardar({ endpoint: e.endpoint, p256dh: e.keys.p256dh, auth: e.keys.auth, usuarioId: actor.tipo === 'usuario' ? actor.id : null })
      if (e.pedidoId) await uow.repos.suscripciones.vincularPedido(e.pedidoId, s.id)
    },

    async desuscribir(endpoint: string) {
      if (endpoint.length < 2000) await uow.repos.suscripciones.eliminarPorEndpoint(endpoint)
    },

    /** Salas de Supabase Realtime a las que el actor tiene derecho (lo valida la propia API: no cruza un token aparte). */
    async salasTiempoReal(actor: Actor, pedidoId: string | undefined, tokenSeguimiento: string | null) {
      const salas: string[] = []
      if (pedidoId) {
        const p = await uow.repos.pedidos.porId(pedidoId)
        if (!p || !d.pedidos.puedeVer(actor, p, tokenSeguimiento)) throw err.noEncontrado('No encontramos ese pedido')
        salas.push(`pedido:${p.id}`)
      } else if (actor.tipo === 'usuario') {
        if (actor.rol === 'admin') salas.push('admin')
        if (['cocina', 'caja'].includes(actor.rol) && actor.sedeId) salas.push(`sede:${actor.sedeId}`)
        if (actor.rol === 'mesero' && actor.sedeId) salas.push(`mesas:${actor.sedeId}`)
        if (actor.rol === 'domiciliario') salas.push(`domiciliario:${actor.id}`)
      }
      if (salas.length === 0) throw err.prohibido()
      return salas
    },
  }
}

export type CasosPush = ReturnType<typeof crearCasosPush>

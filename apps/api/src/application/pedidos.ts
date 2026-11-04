import {
  distanciaKm,
  NOMBRE_ESTADO,
  numero,
  type CrearPedidoInput,
  type EstadoPedido,
  type MetodoPago,
  type PedidoCreadoDTO,
  type PedidoDTO,
  type PedidoDomicilioDTO,
  type RondaInput,
} from '@rejana/shared'
import { ErrorDominio, err } from '../domain/errores'
import { consumoPorReceta, faltantes, productosAfectados, r3, unidadesPreparables } from '../domain/inventario'
import { calcularTotales, clientePuedeCancelar, esDomicilio, esMesa, meseroPuedeCancelar, puedeCerrarse, reponerPorDefecto, validarPago, validarTransicion } from '../domain/pedido'
import { exigirPermiso, exigirSede, puedeOperarSede, tienePermiso, type Actor, type ActorUsuario } from '../domain/permisos'
import { dentroDeCobertura, estaAbierta } from '../domain/sede'
import type { EventoPedido, ItemPedidoRegistro, NuevoPedido, PedidoRegistro, Repositorios, UnidadDeTrabajo } from '../ports/repositorios'
import type { Criptografia, Logger, Notificador, PublicadorEventos, Reloj } from '../ports/servicios'
import { auditar, type ContextoSolicitud } from './comun'
import type { CasosInventario } from './inventario'

export interface DepsPedidos {
  uow: UnidadDeTrabajo
  reloj: Reloj
  cripto: Criptografia
  eventos: PublicadorEventos
  push: Notificador
  log: Logger
  inventario: CasosInventario
  permitirFueraDeHorario: boolean
  /** ETA en vivo de un pedido en camino (lo provee el módulo de domicilios). */
  eta?: (pedidoId: string) => number | null
  /** Aviso al módulo de domicilios cuando un pedido sale del recorrido (p. ej., cancelado en camino). */
  alSalirDeRecorrido?: (pedidoId: string) => void
  /** Al cerrar un pedido (dentro de la misma transacción): p. ej., el sello del Pasaporte. */
  alCerrarPedido?: (repos: Repositorios, p: PedidoRegistro, actorId: string) => Promise<void>
}

export function aPedidoDTO(p: PedidoRegistro, items: ItemPedidoRegistro[], eventos: EventoPedido[], eta: number | null = null): PedidoDTO {
  const base = {
    id: p.id,
    numero: p.numero,
    sedeId: p.sedeId,
    sedeNombre: p.sedeNombre,
    estado: p.estado,
    notas: p.notas,
    subtotal: p.subtotal,
    costoEnvio: p.costoEnvio,
    total: p.total,
    estadoPago: p.estadoPago,
    items: items.map((i) => ({ id: i.id, productoId: i.productoId, nombre: i.nombre, precioUnitario: i.precioUnitario, cantidad: i.cantidad, notas: i.notas, subtotal: i.subtotal })),
    eventos: eventos.map((e) => ({ estado: e.estado, fecha: e.creadoEn.toISOString(), nota: e.nota })),
    motivoCancelacion: p.motivoCancelacion,
    creadoEn: p.creadoEn.toISOString(),
    actualizadoEn: p.actualizadoEn.toISOString(),
    entregadoEn: p.entregadoEn?.toISOString() ?? null,
    cerradoEn: p.cerradoEn?.toISOString() ?? null,
  }
  if (p.canal === 'mesa') {
    return { ...base, canal: 'mesa', mesa: { cuentaId: p.cuentaId, mesaId: p.mesaId, numero: p.mesaNumero, zona: p.zona, ronda: p.ronda, meseroNombre: p.meseroNombre } }
  }
  return {
    ...base,
    canal: 'domicilio',
    contactoNombre: p.contactoNombre,
    contactoTelefono: p.contactoTelefono,
    direccion: p.direccion,
    direccionDetalle: p.direccionDetalle,
    barrio: p.barrio,
    lat: p.lat,
    lng: p.lng,
    metodoPago: p.metodoPago,
    pagaCon: p.pagaCon,
    domiciliarioId: p.domiciliarioId,
    domiciliarioNombre: p.domiciliarioNombre,
    recorridoId: p.recorridoId,
    esInvitado: p.clienteId === null,
    etaMinutos: p.estado === 'en_camino' ? eta : null,
  }
}

const MENSAJES_PUSH: Record<EstadoPedido, (p: PedidoDomicilioDTO) => { titulo: string; cuerpo: string }> = {
  recibido: (p) => ({ titulo: '¡Recibimos tu pedido!', cuerpo: `Pedido #${p.numero}: ya está en la fila de la cocina.` }),
  en_preparacion: (p) => ({ titulo: 'Tu pedido está en la parrilla 🔥', cuerpo: `Pedido #${p.numero}: lo estamos preparando.` }),
  listo: (p) => ({ titulo: 'Tu pedido está listo', cuerpo: `Pedido #${p.numero}: lo estamos empacando para que salga.` }),
  en_camino: (p) => ({
    titulo: '¡Tu pedido está en camino! 🛵',
    cuerpo: `${p.domiciliarioNombre ? `${p.domiciliarioNombre.split(' ')[0]} va` : 'Va'} para tu casa${p.etaMinutos ? `: llega en unos ${p.etaMinutos} min` : ''}. Síguelo en el mapa.`,
  }),
  entregado: () => ({ titulo: '¡Buen provecho! 🍔', cuerpo: 'Gracias por pedir en La Rejana Callejera.' }),
  cancelado: (p) => ({ titulo: 'Tu pedido fue cancelado', cuerpo: p.motivoCancelacion ?? 'Escríbenos si tienes dudas.' }),
}

export function crearCasosPedidos(d: DepsPedidos) {
  const { uow, reloj, cripto, log } = d

  async function dto(repos: Repositorios, p: PedidoRegistro): Promise<PedidoDTO> {
    const [items, eventos] = await Promise.all([repos.pedidos.items([p.id]), repos.pedidos.eventos(p.id)])
    return aPedidoDTO(p, items.get(p.id) ?? [], eventos, d.eta?.(p.id) ?? null)
  }

  async function dtos(repos: Repositorios, lista: PedidoRegistro[]): Promise<PedidoDTO[]> {
    const items = await repos.pedidos.items(lista.map((p) => p.id))
    return lista.map((p) => aPedidoDTO(p, items.get(p.id) ?? [], [], d.eta?.(p.id) ?? null))
  }

  /** ¿Puede este actor ver el pedido? (dueño, invitado con token, domiciliario asignado o personal de la sede) */
  function puedeVer(actor: Actor, p: PedidoRegistro, tokenSeguimiento?: string | null): boolean {
    if (actor.tipo === 'usuario') {
      if (p.clienteId === actor.id) return true
      if (tienePermiso(actor, 'pedidos.ver_sede') && puedeOperarSede(actor, p.sedeId)) return true
      if (actor.rol === 'domiciliario' && p.domiciliarioId === actor.id) return true
      // El mesero ve las rondas de mesa de su sede (nunca los domicilios).
      if (esMesa(p) && tienePermiso(actor, 'mesas.ver') && puedeOperarSede(actor, p.sedeId)) return true
    }
    return !!(tokenSeguimiento && p.tokenSeguimientoHash && tokenSeguimiento.length < 200 && cripto.compararSeguro(p.tokenSeguimientoHash, cripto.huella(tokenSeguimiento)))
  }

  /** Notifica al cliente (push) y a las pantallas (tiempo real). Nunca bloquea la respuesta. */
  function notificar(p: PedidoDTO, clienteId: string | null, push = true) {
    d.eventos.pedidoActualizado(p)
    if (p.canal === 'mesa') {
      // Rondas de mesa: no hay cliente a quien avisar; se refrescan el salón y la caja.
      d.eventos.cuentaActualizada(p.sedeId, p.mesa.cuentaId)
      return
    }
    if (!push) return
    void (async () => {
      const subs = await uow.repos.suscripciones.dePedido(p.id, clienteId)
      const m = MENSAJES_PUSH[p.estado](p)
      for (const s of subs) {
        const r = await d.push.enviar(s, { ...m, url: `/pedido/${p.id}`, etiqueta: `pedido-${p.id}` })
        if (r === 'expirada') await uow.repos.suscripciones.eliminar(s.id)
      }
    })().catch((e: unknown) => log.warn({ err: (e as Error).message }, 'Fallo notificando el pedido'))
  }

  async function publicar(id: string, opciones: { push?: boolean } = {}) {
    const p = await uow.repos.pedidos.porId(id)
    if (!p) return null
    const salida = await dto(uow.repos, p)
    notificar(salida, p.clienteId, opciones.push ?? true)
    return salida
  }

  /** Devuelve al inventario lo que consumió el pedido (una sola vez). */
  async function reponer(repos: Repositorios, p: PedidoRegistro, usuarioId: string | null) {
    const movs = await repos.inventario.movimientosDePedido(p.id)
    const neto = new Map<string, number>()
    for (const m of movs) neto.set(m.insumoId, r3((neto.get(m.insumoId) ?? 0) + m.cantidad))
    const insumos = [...neto.entries()].filter(([, v]) => v < 0)
    if (insumos.length === 0) return []
    await repos.inventario.bloquear(p.sedeId, insumos.map(([i]) => i))
    for (const [insumoId, consumido] of insumos) {
      await repos.inventario.mover({ sedeId: p.sedeId, insumoId, delta: -consumido, tipo: 'reposicion_cancelacion', pedidoId: p.id, usuarioId, nota: `Cancelación pedido #${p.numero}` })
    }
    return insumos.map(([i]) => i)
  }

  type ItemSolicitado = { productoId: string; cantidad: number; notas?: string | undefined }

  /** Precios y disponibilidad SIEMPRE del servidor (nunca del cliente) y consumo de insumos por receta. */
  async function prepararLineas(sedeId: string, items: ItemSolicitado[]) {
    const [menu, productos] = await Promise.all([uow.repos.catalogo.menuDeSede(sedeId), uow.repos.catalogo.productos()])
    const entrada = new Map(menu.map((m) => [m.productoId, m]))
    const producto = new Map(productos.map((p) => [p.id, p]))
    const lineas = items.map((it) => {
      const m = entrada.get(it.productoId)
      const p = producto.get(it.productoId)
      if (!m || !p || !p.activo || !m.disponible) {
        throw new ErrorDominio('PRODUCTO_NO_DISPONIBLE', `${p?.nombre ?? 'Un producto'} no está disponible en esta sede`, { productoId: it.productoId })
      }
      return { productoId: p.id, nombre: p.nombre, precioUnitario: m.precio, cantidad: it.cantidad, notas: it.notas ?? null, subtotal: m.precio * it.cantidad }
    })
    const recetas = new Map([...(await uow.repos.catalogo.recetas(lineas.map((l) => l.productoId))).entries()].map(([k, v]) => [k, v.map((x) => ({ insumoId: x.insumoId, cantidad: x.cantidad }))]))
    const solicitados = lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad }))
    return { lineas, recetas, solicitados, consumo: consumoPorReceta(solicitados, recetas), producto }
  }
  type Preparadas = Awaited<ReturnType<typeof prepararLineas>>

  /** Bloquea los insumos y verifica que alcancen: dos pedidos simultáneos no pueden vender el mismo stock. */
  async function reservarInsumos(repos: Repositorios, sedeId: string, prep: Preparadas, sugerencia: string) {
    const stock = await repos.inventario.bloquear(sedeId, [...prep.consumo.keys()])
    const faltan = faltantes(prep.consumo, stock)
    if (faltan.length === 0) return
    const afectados = productosAfectados(prep.solicitados, prep.recetas, new Set(faltan.map((f) => f.insumoId)))
    const detalle = afectados.map((id) => ({ productoId: id, nombre: prep.producto.get(id)!.nombre, maxUnidades: unidadesPreparables(prep.recetas.get(id) ?? [], stock) ?? 0 }))
    const texto = detalle.map((x) => (x.maxUnidades > 0 ? `${x.nombre} (quedan ${x.maxUnidades})` : x.nombre)).join(', ')
    throw new ErrorDominio('STOCK_INSUFICIENTE', `Se nos acabó lo necesario para: ${texto}. ${sugerencia}`, { productos: detalle })
  }

  /** Crea el pedido y descuenta los insumos por receta (dentro de la transacción, con los insumos ya bloqueados). */
  async function crearYDescontar(repos: Repositorios, datos: NuevoPedido, prep: Preparadas, actor?: { id: string; rol: string }) {
    const p = await repos.pedidos.crear(datos, prep.lineas, actor)
    for (const [insumoId, cantidad] of prep.consumo) {
      await repos.inventario.mover({ sedeId: datos.sedeId, insumoId, delta: -cantidad, tipo: 'consumo_pedido', pedidoId: p.id, nota: p.canal === 'mesa' ? `Mesa ${p.mesaNumero} · ronda ${p.ronda} (#${p.numero})` : `Pedido #${p.numero}` })
    }
    return p
  }

  /** Dos envíos simultáneos con la misma clave de idempotencia: gana uno y el otro recibe el mismo pedido. */
  function esDuplicado(error: unknown): boolean {
    const codigo = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code
    return codigo === '23505'
  }

  return {
    puedeVer,
    publicar,

    async crear(actor: Actor, e: CrearPedidoInput, opciones: { claveIdempotencia?: string | null }, ctx: ContextoSolicitud): Promise<PedidoCreadoDTO> {
      const clienteId = actor.tipo === 'usuario' ? actor.id : null
      if (!clienteId && e.aceptaPrivacidad !== true) {
        throw err.validacion('Para hacer el pedido debes autorizar el tratamiento de tus datos', { campo: 'aceptaPrivacidad' })
      }

      // Reintento del mismo checkout (conexión inestable): se devuelve el pedido ya creado.
      if (opciones.claveIdempotencia) {
        const previo = await uow.repos.pedidos.porIdempotencia(opciones.claveIdempotencia)
        if (previo) return reintento(previo, clienteId)
      }

      const sede = await uow.repos.sedes.porId(e.sedeId)
      if (!sede || !sede.activa) throw new ErrorDominio('SEDE_NO_DISPONIBLE', 'Esa sede no está recibiendo pedidos')
      if (!d.permitirFueraDeHorario && !estaAbierta(sede, reloj.ahora())) {
        throw new ErrorDominio('SEDE_NO_DISPONIBLE', `La sede ${sede.nombre} está cerrada. Atendemos de ${sede.horaApertura} a ${sede.horaCierre}.`)
      }
      const destino = { lat: e.entrega.lat, lng: e.entrega.lng }
      if (!dentroDeCobertura(sede, destino)) {
        const km = distanciaKm(sede, destino)
        throw new ErrorDominio('FUERA_DE_COBERTURA', `Esa dirección está a ${numero(Math.round(km * 10) / 10)} km de la sede ${sede.nombre}; llegamos hasta ${numero(sede.radioEntregaKm)} km.`, { km })
      }

      const prep = await prepararLineas(sede.id, e.items)
      const totales = calcularTotales(prep.lineas, sede.tarifaDomicilio)
      const pagaCon = validarPago(e.metodoPago, totales.total, e.pagaCon)
      const consumo = prep.consumo
      const token = clienteId ? null : cripto.tokenAleatorio(32)

      let creado: PedidoRegistro
      try {
        creado = await uow.transaccion(async (repos) => {
          await reservarInsumos(repos, sede.id, prep, 'Ajusta tu carrito.')
          const p = await crearYDescontar(repos, {
            sedeId: sede.id,
            clienteId,
            contactoNombre: e.contacto.nombre,
            contactoTelefono: e.contacto.telefono,
            direccion: e.entrega.direccion,
            direccionDetalle: e.entrega.detalle ?? null,
            barrio: e.entrega.barrio ?? null,
            lat: e.entrega.lat,
            lng: e.entrega.lng,
            notas: e.notas ?? null,
            metodoPago: e.metodoPago,
            pagaCon,
            ...totales,
            tokenSeguimientoHash: token ? cripto.huella(token) : null,
            claveIdempotencia: opciones.claveIdempotencia ?? null,
          }, prep)
          if (clienteId && e.guardarDireccion && (await repos.direcciones.contar(clienteId)) < 10) {
            const ya = (await repos.direcciones.deUsuario(clienteId)).some((x) => x.direccion.toLowerCase() === e.entrega.direccion.toLowerCase())
            if (!ya) await repos.direcciones.crear({ usuarioId: clienteId, etiqueta: 'Casa', direccion: e.entrega.direccion, detalle: e.entrega.detalle ?? null, barrio: e.entrega.barrio ?? null, lat: e.entrega.lat, lng: e.entrega.lng })
          }
          return p
        })
      } catch (error) {
        if (esDuplicado(error) && opciones.claveIdempotencia) {
          const previo = await uow.repos.pedidos.porIdempotencia(opciones.claveIdempotencia)
          if (previo) return reintento(previo, clienteId)
        }
        throw error
      }

      void d.inventario.revisarAlertas(sede.id, [...consumo.keys()]).catch(() => {})
      d.eventos.menuCambio(sede.id)
      const salida = (await dto(uow.repos, creado)) as PedidoDomicilioDTO
      d.eventos.pedidoActualizado(salida)
      log.info({ pedido: creado.numero, sede: sede.slug, ip: ctx.ip ? 'registrada' : null }, 'Pedido creado')
      return { pedido: salida, tokenSeguimiento: token }

      async function reintento(previo: PedidoRegistro, quien: string | null): Promise<PedidoCreadoDTO> {
        if (!esDomicilio(previo) || (previo.clienteId ?? null) !== quien) throw err.conflicto('Esta solicitud ya se usó. Recarga la página.')
        let tokenNuevo: string | null = null
        if (!quien) {
          // El invitado perdió la respuesta original: se emite un token nuevo (la clave de idempotencia es secreta).
          tokenNuevo = cripto.tokenAleatorio(32)
          await uow.repos.pedidos.rotarTokenSeguimiento(previo.id, cripto.huella(tokenNuevo))
        }
        return { pedido: (await dto(uow.repos, previo)) as PedidoDomicilioDTO, tokenSeguimiento: tokenNuevo }
      }
    },

    /**
     * Ronda de una mesa: el mesero envía a la cocina lo que pidió la mesa. Mismo camino que un domicilio:
     * precios del servidor, insumos bloqueados y descontados por receta en la misma transacción.
     */
    async crearRonda(actor: Actor, cuentaId: string, e: RondaInput, opciones: { claveIdempotencia?: string | null }, ctx: ContextoSolicitud): Promise<PedidoDTO> {
      const a = exigirPermiso(actor, 'mesas.atender')
      if (opciones.claveIdempotencia) {
        const previo = await uow.repos.pedidos.porIdempotencia(opciones.claveIdempotencia)
        if (previo) return rondaRepetida(previo)
      }
      const cuenta = await uow.repos.mesas.cuenta(cuentaId)
      if (!cuenta) throw err.noEncontrado('No encontramos esa cuenta')
      exigirSede(a, cuenta.sedeId)
      if (cuenta.estado !== 'abierta') throw err.conflicto('La cuenta de esta mesa ya se cerró')
      const sede = await uow.repos.sedes.porId(cuenta.sedeId)
      if (!sede?.activa) throw new ErrorDominio('SEDE_NO_DISPONIBLE', 'Esta sede no está recibiendo pedidos')
      const prep = await prepararLineas(cuenta.sedeId, e.items)
      const totales = calcularTotales(prep.lineas, 0)

      let creado: PedidoRegistro
      try {
        creado = await uow.transaccion(async (repos) => {
          const c = await repos.mesas.cuenta(cuentaId, { bloquear: true })
          if (!c || c.estado !== 'abierta') throw err.conflicto('La cuenta de esta mesa ya se cerró')
          await reservarInsumos(repos, c.sedeId, prep, 'Avísale a la mesa y ajusta la ronda.')
          const ronda = await repos.mesas.siguienteRonda(c.id)
          const p = await crearYDescontar(
            repos,
            { canal: 'mesa', sedeId: c.sedeId, cuentaId: c.id, ronda, notas: e.notas ?? null, ...totales, claveIdempotencia: opciones.claveIdempotencia ?? null },
            prep,
            { id: a.id, rol: a.rol },
          )
          // Si la mesa había pedido la cuenta y sigue pidiendo, la caja ya no la ve por cobrar.
          if (c.cuentaPedidaEn) await repos.mesas.actualizarCuenta(c.id, { cuentaPedidaEn: null })
          return p
        })
      } catch (error) {
        if (esDuplicado(error) && opciones.claveIdempotencia) {
          const previo = await uow.repos.pedidos.porIdempotencia(opciones.claveIdempotencia)
          if (previo) return rondaRepetida(previo)
        }
        throw error
      }

      void d.inventario.revisarAlertas(cuenta.sedeId, [...prep.consumo.keys()]).catch(() => {})
      d.eventos.menuCambio(cuenta.sedeId)
      log.info({ pedido: creado.numero, mesa: cuenta.mesaNumero, ip: ctx.ip ? 'registrada' : null }, 'Ronda enviada a cocina')
      return (await publicar(creado.id))!

      async function rondaRepetida(previo: PedidoRegistro): Promise<PedidoDTO> {
        // La misma clave solo puede repetir la misma ronda de la misma cuenta.
        if (!esMesa(previo) || previo.cuentaId !== cuentaId) throw err.conflicto('Esta solicitud ya se usó. Recarga la página.')
        return dto(uow.repos, previo)
      }
    },

    async obtener(actor: Actor, id: string, tokenSeguimiento?: string | null): Promise<PedidoDTO> {
      const p = await uow.repos.pedidos.porId(id)
      // Sin permiso se responde "no existe" para no confirmar ids ajenos.
      if (!p || !puedeVer(actor, p, tokenSeguimiento)) throw err.noEncontrado('No encontramos ese pedido')
      return dto(uow.repos, p)
    },

    async misPedidos(actor: Actor): Promise<PedidoDTO[]> {
      if (actor.tipo !== 'usuario') throw err.noAutenticado()
      return dtos(uow.repos, await uow.repos.pedidos.listar({ clienteId: actor.id, limite: 50 }))
    },

    /** Pedidos de los invitados guardados en el dispositivo (id + token). */
    async deInvitado(credenciales: { id: string; token: string }[]): Promise<PedidoDTO[]> {
      const salida: PedidoDTO[] = []
      for (const c of credenciales.slice(0, 20)) {
        const p = await uow.repos.pedidos.porId(c.id)
        if (p && puedeVer({ tipo: 'invitado' }, p, c.token)) salida.push(await dto(uow.repos, p))
      }
      return salida
    },

    /** Tablero de operación de una sede (cocina, caja, admin). */
    async operacion(actor: Actor, sedeId: string, filtro: { estados?: EstadoPedido[]; incluirCerrados?: boolean }) {
      exigirPermiso(actor, 'pedidos.ver_sede')
      exigirSede(actor, sedeId)
      const desde = new Date(reloj.ahora().getTime() - 24 * 3_600_000)
      const lista = await uow.repos.pedidos.listar({ sedeId, estados: filtro.estados, desde, sinCerrar: !filtro.incluirCerrados, limite: 300 })
      return dtos(uow.repos, lista)
    },

    async cambiarEstado(actor: Actor, id: string, e: { estado: EstadoPedido; nota?: string }, ctx: ContextoSolicitud): Promise<PedidoDTO> {
      if (e.estado === 'cancelado') throw err.validacion('Para cancelar usa la opción «Cancelar pedido» con el motivo')
      if (actor.tipo !== 'usuario') throw err.noAutenticado()
      const ahora = reloj.ahora()
      const antes = await uow.transaccion(async (repos) => {
        const p = await repos.pedidos.porId(id, { bloquear: true })
        if (!p) throw err.noEncontrado('No encontramos ese pedido')
        if (actor.rol === 'domiciliario') {
          if (p.domiciliarioId !== actor.id) throw err.prohibido('Ese pedido no está asignado a ti')
        } else exigirSede(actor, p.sedeId)
        validarTransicion(actor, p.estado, e.estado, p.canal)
        if (e.estado === 'en_camino' && !p.domiciliarioId) throw err.validacion('Asigna un domiciliario antes de despachar el pedido')
        await repos.pedidos.actualizar(p.id, {
          estado: e.estado,
          ...(e.estado === 'en_camino' ? { enCaminoEn: ahora } : {}),
          ...(e.estado === 'entregado' ? { entregadoEn: ahora } : {}),
        })
        await repos.pedidos.registrarEvento({ pedidoId: p.id, estado: e.estado, actorId: actor.id, actorRol: actor.rol, nota: e.nota ?? null })
        return p
      })
      log.info({ pedido: antes.numero, de: antes.estado, a: e.estado, rol: actor.rol, ip: ctx.ip ? 'ok' : null }, 'Cambio de estado')
      return (await publicar(id))!
    },

    async asignarDomiciliario(actor: Actor, id: string, domiciliarioId: string, ctx: ContextoSolicitud): Promise<PedidoDTO> {
      exigirPermiso(actor, 'pedidos.despachar')
      await uow.transaccion(async (repos) => {
        const p = await repos.pedidos.porId(id, { bloquear: true })
        if (!p) throw err.noEncontrado('No encontramos ese pedido')
        exigirSede(actor, p.sedeId)
        if (!esDomicilio(p)) throw err.validacion('Las rondas de mesa no llevan domiciliario')
        if (!['recibido', 'en_preparacion', 'listo'].includes(p.estado)) throw new ErrorDominio('TRANSICION_INVALIDA', `No se puede asignar un pedido ${NOMBRE_ESTADO[p.estado].toLowerCase()}`)
        const dom = await repos.usuarios.porId(domiciliarioId)
        if (!dom || dom.rol !== 'domiciliario' || !dom.activo || dom.sedeId !== p.sedeId) throw err.validacion('Ese domiciliario no está disponible en esta sede')
        await repos.pedidos.actualizar(p.id, { domiciliarioId })
        await repos.pedidos.registrarEvento({ pedidoId: p.id, estado: p.estado, actorId: actor.tipo === 'usuario' ? actor.id : null, actorRol: actor.tipo === 'usuario' ? actor.rol : null, nota: `Asignado a ${dom.nombre}` })
      })
      void ctx
      return (await publicar(id, { push: false }))!
    },

    async cancelar(actor: Actor, id: string, e: { motivo: string; reponerInventario?: boolean }, tokenSeguimiento: string | null, ctx: ContextoSolicitud): Promise<PedidoDTO> {
      const ahora = reloj.ahora()
      let repuestos: string[] = []
      let sedeId = ''
      await uow.transaccion(async (repos) => {
        const p = await repos.pedidos.porId(id, { bloquear: true })
        if (!p) throw err.noEncontrado('No encontramos ese pedido')
        sedeId = p.sedeId
        const esPersonal = actor.tipo === 'usuario' && tienePermiso(actor, 'pedidos.cancelar') && puedeOperarSede(actor, p.sedeId)
        const esMeseroDeLaSede = actor.tipo === 'usuario' && esMesa(p) && tienePermiso(actor, 'mesas.atender') && puedeOperarSede(actor, p.sedeId)
        let reponerInv: boolean
        if (esPersonal) {
          validarTransicion(actor, p.estado, 'cancelado', p.canal)
          reponerInv = e.reponerInventario ?? reponerPorDefecto(p.estado)
        } else if (esMeseroDeLaSede) {
          // El mesero corrige su ronda solo si la cocina no la ha empezado; los insumos siempre vuelven.
          if (!meseroPuedeCancelar(p.estado)) throw new ErrorDominio('TRANSICION_INVALIDA', 'La cocina ya empezó esta ronda: para cancelarla pídeselo a la caja.')
          reponerInv = true
        } else {
          // El cliente (o el invitado con su token) solo cancela si la cocina no ha empezado.
          const esDueno = (actor.tipo === 'usuario' && p.clienteId === actor.id) || puedeVer({ tipo: 'invitado' }, p, tokenSeguimiento)
          if (!esDueno) throw err.noEncontrado('No encontramos ese pedido')
          if (!clientePuedeCancelar(p.estado)) throw new ErrorDominio('TRANSICION_INVALIDA', 'Tu pedido ya está en preparación: para cancelarlo llama a la sede.')
          reponerInv = true
        }
        await repos.pedidos.actualizar(p.id, { estado: 'cancelado', canceladoEn: ahora, motivoCancelacion: e.motivo })
        await repos.pedidos.registrarEvento({
          pedidoId: p.id,
          estado: 'cancelado',
          actorId: actor.tipo === 'usuario' ? actor.id : null,
          actorRol: actor.tipo === 'usuario' ? actor.rol : 'invitado',
          nota: e.motivo,
        })
        if (reponerInv) repuestos = await reponer(repos, p, actor.tipo === 'usuario' ? actor.id : null)
        if (esPersonal || esMeseroDeLaSede) await auditar(repos, actor, 'pedido.cancelar', 'pedido', p.id, { numero: p.numero, canal: p.canal, motivo: e.motivo, reponerInventario: reponerInv }, ctx.ip)
      })
      if (repuestos.length) d.eventos.menuCambio(sedeId)
      d.alSalirDeRecorrido?.(id)
      return (await publicar(id))!
    },

    async registrarPago(actor: Actor, id: string, e: { metodo: MetodoPago; monto: number; recibido?: number; referencia?: string }, ctx: ContextoSolicitud): Promise<PedidoDTO> {
      const a = exigirPermiso(actor, 'pedidos.cobrar')
      await uow.transaccion(async (repos) => {
        const p = await repos.pedidos.porId(id, { bloquear: true })
        if (!p) throw err.noEncontrado('No encontramos ese pedido')
        exigirSede(actor, p.sedeId)
        if (esMesa(p)) throw err.validacion('Las rondas de una mesa se cobran juntas, desde la cuenta de la mesa')
        if (p.estado === 'cancelado') throw err.validacion('No se puede cobrar un pedido cancelado')
        if (p.estadoPago === 'pagado') throw err.conflicto('Este pedido ya está pagado')
        const pagado = (await repos.pedidos.pagos(p.id)).reduce((s, x) => s + x.monto, 0)
        const pendiente = p.total - pagado
        if (e.monto <= 0 || e.monto > pendiente) throw err.validacion(`El monto debe estar entre $1 y lo pendiente (${pendiente})`)
        let cambio: number | null = null
        if (e.metodo === 'efectivo' && e.recibido !== undefined) {
          if (e.recibido < e.monto) throw err.validacion('El efectivo recibido no alcanza para el monto')
          cambio = e.recibido - e.monto
        }
        await repos.pedidos.registrarPago({ pedidoId: p.id, metodo: e.metodo, monto: e.monto, recibido: e.recibido ?? null, cambio, referencia: e.referencia ?? null, registradoPor: a.id })
        if (pagado + e.monto >= p.total) await repos.pedidos.actualizar(p.id, { estadoPago: 'pagado' })
        await auditar(repos, actor, 'pedido.pago', 'pedido', p.id, { numero: p.numero, metodo: e.metodo, monto: e.monto }, ctx.ip)
      })
      return (await publicar(id, { push: false }))!
    },

    async cerrar(actor: Actor, id: string, ctx: ContextoSolicitud): Promise<PedidoDTO> {
      const a = exigirPermiso(actor, 'pedidos.cobrar')
      await uow.transaccion(async (repos) => {
        const p = await repos.pedidos.porId(id, { bloquear: true })
        if (!p) throw err.noEncontrado('No encontramos ese pedido')
        exigirSede(actor, p.sedeId)
        if (esMesa(p)) throw err.validacion('Las rondas de una mesa se cierran al cobrar la cuenta de la mesa')
        if (p.cerradoEn) throw err.conflicto('El pedido ya está cerrado')
        if (!puedeCerrarse(p.estado, p.estadoPago)) throw err.validacion('Solo se cierra un pedido entregado y pagado')
        await repos.pedidos.actualizar(p.id, { cerradoEn: reloj.ahora(), cerradoPor: a.id })
        await auditar(repos, actor, 'pedido.cerrar', 'pedido', p.id, { numero: p.numero }, ctx.ip)
        await d.alCerrarPedido?.(repos, { ...p, estadoPago: 'pagado' }, a.id)
      })
      return (await publicar(id, { push: false }))!
    },

    /**
     * Ronda de premio del Pasaporte (precio cero), dentro de la transacción de quien canjea: la cocina la
     * prepara y los insumos se descuentan por receta como en cualquier ronda. La cuenta ya viene bloqueada.
     */
    async rondaPremio(repos: Repositorios, a: ActorUsuario, cuenta: { id: string; sedeId: string }, productoId: string): Promise<PedidoRegistro> {
      const prep = await prepararLineas(cuenta.sedeId, [{ productoId, cantidad: 1, notas: 'Premio del Pasaporte' }])
      const conPremio = { ...prep, lineas: prep.lineas.map((l) => ({ ...l, precioUnitario: 0, subtotal: 0 })) }
      await reservarInsumos(repos, cuenta.sedeId, conPremio, 'El premio no se puede preparar ahora.')
      const ronda = await repos.mesas.siguienteRonda(cuenta.id)
      return crearYDescontar(
        repos,
        { canal: 'mesa', sedeId: cuenta.sedeId, cuentaId: cuenta.id, ronda, notas: null, subtotal: 0, costoEnvio: 0, total: 0, claveIdempotencia: null },
        conPremio,
        { id: a.id, rol: a.rol },
      )
    },

    async pagos(actor: Actor, id: string) {
      exigirPermiso(actor, 'pedidos.cobrar')
      const p = await uow.repos.pedidos.porId(id)
      if (!p) throw err.noEncontrado('No encontramos ese pedido')
      exigirSede(actor, p.sedeId)
      return (await uow.repos.pedidos.pagos(id)).map((x) => ({ ...x, creadoEn: x.creadoEn.toISOString() }))
    },

    async domiciliarios(actor: Actor, sedeId: string) {
      exigirPermiso(actor, 'pedidos.despachar')
      exigirSede(actor, sedeId)
      return (await uow.repos.usuarios.domiciliarios(sedeId)).map((u) => ({ id: u.id, nombre: u.nombre, telefono: u.telefono }))
    },
  }
}

export type CasosPedidos = ReturnType<typeof crearCasosPedidos>

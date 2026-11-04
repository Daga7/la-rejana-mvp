import { cantidadInsumo, cop, diaBogota, numero, type SolicitudReporte } from '@rejana/shared'
import { ErrorDominio } from '../domain/errores'
import { exigirPermiso, type Actor } from '../domain/permisos'
import type { UnidadDeTrabajo } from '../ports/repositorios'
import type { DocumentoReporte, GeneradorPdf, InterpreteSolicitudes, Logger, MensajeriaWhatsApp, Reloj, Transcriptor } from '../ports/servicios'
import { auditar } from './comun'
import type { CasosReportes } from './reportes'

// Asistente de reportes por WhatsApp para administradores.
// Flujo: (nota de voz → transcripción) → intérprete (IA o reglas) → solicitud del catálogo cerrado
// → consulta fija y parametrizada → PDF con gráficas → respuesta por el mismo chat.

export interface MensajeEntrante {
  wamid: string
  /** Número del remitente tal como lo envía Meta (solo dígitos, con indicativo). */
  de: string
  tipo: string
  texto?: string
  mediaId?: string
}

export type RespuestaAsistente =
  | { tipo: 'pdf'; pdf: Buffer; nombreArchivo: string; leyenda: string; solicitud: SolicitudReporte }
  | { tipo: 'texto'; mensaje: string; solicitud?: SolicitudReporte }

export interface DepsAsistente {
  uow: UnidadDeTrabajo
  reloj: Reloj
  log: Logger
  whatsapp: MensajeriaWhatsApp
  stt: Transcriptor
  ia: InterpreteSolicitudes
  pdf: GeneradorPdf
  reportes: CasosReportes
}

const MAX_POR_HORA = 20

const fechaCorta = (dia: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${dia}T12:00:00Z`)).replace('.', '')
const enmascarar = (tel: string) => `${tel.slice(0, 5)}•••${tel.slice(-2)}`

export function crearCasosAsistente(d: DepsAsistente) {
  const { uow, reloj, log, reportes } = d
  const uso = new Map<string, number[]>()

  async function contexto() {
    const [sedes, insumos] = await Promise.all([uow.repos.sedes.todas(false), uow.repos.inventario.insumos(true)])
    return { hoy: diaBogota(reloj.ahora()), sedes: sedes.map((s) => s.nombre), insumos: insumos.map((i) => i.nombre) }
  }

  async function documento(sol: SolicitudReporte): Promise<{ doc: DocumentoReporte; nombreArchivo: string; leyenda: string } | { mensaje: string }> {
    const sedeId = await reportes.sedePorNombre(sol.sede)
    const generadoEn = reloj.ahora()

    if (sol.tipo === 'ventas') {
      const rango = reportes.rango(sol)
      const r = await reportes.ventas(sedeId, rango)
      const donde = r.sedeNombre ? `sede ${r.sedeNombre}` : 'todas las sedes'
      const mejor = r.porDia.reduce((a, b) => (b.ventas > a.ventas ? b : a), r.porDia[0]!)
      const variosDias = r.porDia.length > 1
      const variasSedes = !sedeId && r.seriesPorSede.length > 1
      const doc: DocumentoReporte = {
        titulo: 'Reporte de ventas',
        subtitulo: `${rango.etiqueta[0]!.toUpperCase()}${rango.etiqueta.slice(1)} · ${donde} · pedidos no cancelados`,
        generadoEn,
        indicadores: [
          { etiqueta: 'Ventas', valor: cop(r.ventas) },
          { etiqueta: 'Pedidos', valor: numero(r.pedidos) },
          { etiqueta: 'Ticket promedio', valor: cop(r.ticketPromedio) },
          ...(variosDias && mejor.ventas > 0 ? [{ etiqueta: `Mejor día (${fechaCorta(mejor.dia)})`, valor: cop(mejor.ventas) }] : []),
        ],
        grafica: variosDias
          ? variasSedes
            ? { tipo: 'lineas', titulo: 'Ventas diarias por sede', etiquetas: r.porDia.map((x) => fechaCorta(x.dia)), series: r.seriesPorSede.map((s) => ({ nombre: s.sedeNombre, valores: s.valores })), formato: 'pesos' }
            : { tipo: r.porDia.length <= 31 ? 'barras' : 'lineas', titulo: 'Ventas diarias', etiquetas: r.porDia.map((x) => fechaCorta(x.dia)), series: [{ nombre: r.sedeNombre ?? 'Ventas', valores: r.porDia.map((x) => x.ventas) }], formato: 'pesos' }
          : undefined,
        tabla: variosDias
          ? {
              titulo: 'Detalle por día',
              columnas: [{ titulo: 'Día' }, ...(variasSedes ? r.seriesPorSede.map((s) => ({ titulo: s.sedeNombre, alineacion: 'derecha' as const })) : []), { titulo: 'Pedidos', alineacion: 'derecha' }, { titulo: 'Total', alineacion: 'derecha' }],
              filas: r.porDia.map((x, i) => [fechaCorta(x.dia), ...(variasSedes ? r.seriesPorSede.map((s) => cop(s.valores[i] ?? 0)) : []), numero(x.pedidos), cop(x.ventas)]),
            }
          : {
              titulo: 'Por sede',
              columnas: [{ titulo: 'Sede' }, { titulo: 'Pedidos', alineacion: 'derecha' }, { titulo: 'Ventas', alineacion: 'derecha' }],
              filas: r.porSede.map((s) => [s.sedeNombre, numero(s.pedidos), cop(s.ventas)]),
            },
        notas: ['Las ventas incluyen el valor del domicilio. Se cuentan los pedidos no cancelados según su fecha de creación (hora de Bogotá). Si el periodo incluye hoy, el último día va en curso.'],
      }
      return {
        doc,
        nombreArchivo: `rejana-ventas-${rango.diaDesde}_${rango.diaHasta}.pdf`,
        leyenda: `📊 Ventas de ${rango.etiqueta} (${donde}): ${cop(r.ventas)} en ${numero(r.pedidos)} pedidos. Ticket promedio ${cop(r.ticketPromedio)}.`,
      }
    }

    if (sol.tipo === 'productos_mas_vendidos') {
      const rango = reportes.rango(sol)
      const r = await reportes.productosMasVendidos(sedeId, rango, 15)
      const donde = r.sedeNombre ? `sede ${r.sedeNombre}` : 'todas las sedes'
      if (r.productos.length === 0) return { mensaje: `No hubo ventas en ${rango.etiqueta} (${donde}).` }
      const totalUnidades = r.productos.reduce((s, p) => s + p.unidades, 0)
      const top = r.productos[0]!
      const doc: DocumentoReporte = {
        titulo: 'Lo más vendido',
        subtitulo: `${rango.etiqueta[0]!.toUpperCase()}${rango.etiqueta.slice(1)} · ${donde}`,
        generadoEn,
        indicadores: [
          { etiqueta: 'Unidades vendidas', valor: numero(totalUnidades) },
          { etiqueta: 'Ventas de productos', valor: cop(r.productos.reduce((s, p) => s + p.ventas, 0)) },
          { etiqueta: 'Producto estrella', valor: top.nombre },
        ],
        grafica: { tipo: 'barras_horizontales', titulo: 'Unidades vendidas por producto', etiquetas: r.productos.slice(0, 10).map((p) => p.nombre), series: [{ nombre: 'Unidades', valores: r.productos.slice(0, 10).map((p) => p.unidades) }], formato: 'numero' },
        tabla: {
          titulo: 'Ranking de productos',
          columnas: [{ titulo: 'Producto' }, { titulo: 'Unidades', alineacion: 'derecha' }, { titulo: '% de unidades', alineacion: 'derecha' }, { titulo: 'Ventas', alineacion: 'derecha' }],
          filas: r.productos.map((p, i) => [`${i + 1}. ${p.nombre}`, numero(p.unidades), `${numero(Math.round((p.unidades / totalUnidades) * 1000) / 10)} %`, cop(p.ventas)]),
        },
      }
      return {
        doc,
        nombreArchivo: `rejana-productos-${rango.diaDesde}_${rango.diaHasta}.pdf`,
        leyenda: `🍔 Lo más vendido en ${rango.etiqueta} (${donde}): ${top.nombre} con ${numero(top.unidades)} unidades.`,
      }
    }

    // Inventario
    const r = await reportes.inventario(sedeId, sol.insumo)
    if (r.filas.length === 0) return { mensaje: `No encontré insumos que coincidan con «${sol.insumo ?? ''}». Prueba con otra palabra (por ejemplo «pan», «carne» o «chorizo»).` }
    const bajos = r.filas.filter((f) => f.bajo)
    const conMinimo = r.filas.filter((f) => f.stockMinimo > 0).map((f) => ({ ...f, veces: Math.round((f.cantidad / f.stockMinimo) * 10) / 10 }))
    conMinimo.sort((a, b) => a.veces - b.veces)
    const donde = r.sedeNombre ? `sede ${r.sedeNombre}` : 'todas las sedes'
    const doc: DocumentoReporte = {
      titulo: 'Inventario',
      subtitulo: `${donde}${sol.insumo ? ` · insumos con «${sol.insumo}»` : ''} · existencias actuales`,
      generadoEn,
      indicadores: [
        { etiqueta: 'Insumos consultados', valor: numero(r.filas.length) },
        { etiqueta: 'Bajo el mínimo', valor: numero(bajos.length) },
        { etiqueta: 'Sedes', valor: r.sedeNombre ?? numero(new Set(r.filas.map((f) => f.sedeNombre)).size) },
      ],
      grafica: conMinimo.length
        ? {
            tipo: 'barras_horizontales',
            titulo: 'Existencias frente al mínimo (veces el mínimo; los más críticos primero)',
            etiquetas: conMinimo.slice(0, 12).map((f) => (r.sedeNombre ? f.insumo : `${f.sedeNombre} · ${f.insumo}`)),
            series: [{ nombre: 'Veces el mínimo', valores: conMinimo.slice(0, 12).map((f) => f.veces) }],
            formato: 'numero',
          }
        : undefined,
      tabla: {
        titulo: 'Existencias',
        columnas: [{ titulo: 'Insumo' }, { titulo: 'Sede' }, { titulo: 'Existencias', alineacion: 'derecha' }, { titulo: 'Mínimo', alineacion: 'derecha' }, { titulo: 'Estado' }],
        filas: r.filas.map((f) => [f.insumo, f.sedeNombre, cantidadInsumo(f.cantidad, f.unidad), cantidadInsumo(f.stockMinimo, f.unidad), f.bajo ? 'Bajo el mínimo' : 'Bien']),
      },
    }
    const resumen = r.filas
      .slice(0, 4)
      .map((f) => `• ${f.insumo}${r.sedeNombre ? '' : ` (${f.sedeNombre})`}: ${cantidadInsumo(f.cantidad, f.unidad)}${f.bajo ? ' ⚠️ bajo el mínimo' : ''}`)
      .join('\n')
    return {
      doc,
      nombreArchivo: `rejana-inventario-${diaBogota(generadoEn)}.pdf`,
      leyenda: `📦 Inventario (${donde}):\n${resumen}${r.filas.length > 4 ? `\n…y ${r.filas.length - 4} más en el PDF.` : ''}`,
    }
  }

  /** Solicitud ya estructurada → PDF (o mensaje si no hay datos). */
  async function responderSolicitud(sol: SolicitudReporte): Promise<RespuestaAsistente> {
    const sedes = (await uow.repos.sedes.todas(false)).map((s) => s.nombre)
    try {
      const r = await documento(sol)
      if ('mensaje' in r) return { tipo: 'texto', mensaje: r.mensaje, solicitud: sol }
      return { tipo: 'pdf', pdf: await d.pdf.generar(r.doc), nombreArchivo: r.nombreArchivo, leyenda: r.leyenda, solicitud: sol }
    } catch (e) {
      if (e instanceof ErrorDominio && (e.codigo === 'NO_ENCONTRADO' || e.codigo === 'VALIDACION')) {
        return { tipo: 'texto', mensaje: `${e.message}. Las sedes son: ${sedes.join(' y ')}.`, solicitud: sol }
      }
      throw e
    }
  }

  /** De texto libre a respuesta (PDF o mensaje). Lo usan WhatsApp y la página de prueba del admin. */
  async function responder(texto: string): Promise<RespuestaAsistente> {
    const interpretado = await d.ia.interpretar(texto, await contexto())
    if (interpretado.tipo === 'aclaracion') return { tipo: 'texto', mensaje: interpretado.mensaje }
    return responderSolicitud(interpretado.solicitud)
  }

  return {
    responder,
    responderSolicitud,

    /** Página de prueba del admin: mismo flujo que WhatsApp, sin enviar nada. */
    async probar(actor: Actor, texto: string) {
      const a = exigirPermiso(actor, 'reportes.ver')
      const r = await responder(texto)
      await auditar(uow.repos, actor, 'asistente.consulta', 'reporte', null, { canal: 'web', solicitud: r.solicitud ?? null, usuario: a.id })
      return r
    },

    async procesarMensaje(m: MensajeEntrante): Promise<'ignorado' | 'duplicado' | 'procesado' | 'error'> {
      const telefono = `+${m.de.replace(/\D/g, '')}`
      // Lista blanca: solo administradores activos con el asistente habilitado y ese celular.
      const admin = await uow.repos.usuarios.adminWhatsapp(telefono)
      if (!admin) {
        log.warn({ telefono: enmascarar(telefono) }, 'WhatsApp de un número no autorizado: se ignora')
        return 'ignorado'
      }
      if (!(await uow.repos.whatsapp.registrarEntrante(m.wamid, telefono, m.tipo))) return 'duplicado'
      const ahora = reloj.ahora().getTime()
      const recientes = (uso.get(telefono) ?? []).filter((t) => ahora - t < 3_600_000)
      if (recientes.length >= MAX_POR_HORA) {
        await d.whatsapp.enviarTexto(telefono, 'Llegaste al límite de reportes por hora. Inténtalo un poco más tarde.')
        await uow.repos.whatsapp.marcar(m.wamid, 'ignorado', reloj.ahora())
        return 'ignorado'
      }
      uso.set(telefono, [...recientes, ahora])
      try {
        let texto = m.texto?.trim() ?? ''
        if (m.tipo === 'audio' && m.mediaId) {
          try {
            const audio = await d.whatsapp.descargarMedia(m.mediaId)
            texto = (await d.stt.transcribir(audio.datos, audio.mime)).trim()
          } catch (e) {
            log.warn({ err: (e as Error).message }, 'No se pudo transcribir la nota de voz')
            await d.whatsapp.enviarTexto(telefono, 'No pude escuchar la nota de voz 🎧. ¿Me escribes lo que necesitas?')
            await uow.repos.whatsapp.marcar(m.wamid, 'procesado', reloj.ahora())
            return 'procesado'
          }
        }
        if (!texto) {
          await d.whatsapp.enviarTexto(telefono, 'Por ahora entiendo mensajes de texto y notas de voz. Escríbeme, por ejemplo: «ventas de este mes».')
          await uow.repos.whatsapp.marcar(m.wamid, 'procesado', reloj.ahora())
          return 'procesado'
        }
        const r = await responder(texto)
        if (r.tipo === 'pdf') await d.whatsapp.enviarDocumento(telefono, r.pdf, r.nombreArchivo, r.leyenda)
        else await d.whatsapp.enviarTexto(telefono, r.mensaje)
        await auditar(uow.repos, { tipo: 'usuario', id: admin.id, rol: 'admin', sedeId: null, sesionId: 'whatsapp' }, 'asistente.consulta', 'reporte', null, { canal: 'whatsapp', solicitud: r.solicitud ?? null })
        await uow.repos.whatsapp.marcar(m.wamid, 'procesado', reloj.ahora())
        return 'procesado'
      } catch (e) {
        log.error({ err: (e as Error).message }, 'Error del asistente de WhatsApp')
        await d.whatsapp.enviarTexto(telefono, 'Tuve un problema preparando el reporte 😓. Inténtalo de nuevo en un momento.').catch(() => {})
        await uow.repos.whatsapp.marcar(m.wamid, 'error', reloj.ahora())
        return 'error'
      }
    },
  }
}

export type CasosAsistente = ReturnType<typeof crearCasosAsistente>

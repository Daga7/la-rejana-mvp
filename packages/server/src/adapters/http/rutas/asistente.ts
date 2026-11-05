import { consultaReporteSchema, probarAsistenteSchema } from '@rejana/shared'
import type { Peticion, Router } from '../router'
import { z } from 'zod'
import type { MensajeEntrante } from '../../../application/asistente'
import type { Contenedor } from '../../../contenedor'
import { exigirPermiso } from '../../../domain/permisos'
import { cuerpoError } from '../errores'
import { actorDe } from '../servidor'

// Estructura (parcial) del webhook de WhatsApp Business Cloud API.
const webhook = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  messages: z
                    .array(
                      z.object({
                        id: z.string().max(200),
                        from: z.string().max(20),
                        type: z.string().max(30),
                        text: z.object({ body: z.string().max(4000) }).optional(),
                        audio: z.object({ id: z.string().max(200) }).optional(),
                      }),
                    )
                    .optional(),
                })
                .passthrough(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
})

export function rutasAsistente(app: Router, c: Contenedor) {
  const { asistente } = c.casos
  const actor = (req: Peticion) => actorDe(req, c, c.env)

  // Verificación del webhook (Meta llama una vez con hub.challenge).
  app.get('/api/webhooks/whatsapp', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>
    const token = c.env.WHATSAPP_VERIFY_TOKEN
    if (q['hub.mode'] === 'subscribe' && token && typeof q['hub.verify_token'] === 'string' && c.cripto.compararSeguro(q['hub.verify_token'], token)) {
      return reply.type('text/plain').send(String(q['hub.challenge'] ?? '').slice(0, 200))
    }
    return reply.status(403).send(cuerpoError('PROHIBIDO', 'Verificación inválida'))
  })

  // Mensajes entrantes: se valida la firma sobre el cuerpo crudo, se responde 200 de inmediato y se
  // procesa en segundo plano (Meta reintenta si la respuesta tarda; la idempotencia por wamid lo cubre).
  app.post('/api/webhooks/whatsapp', { config: { csrf: false, rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req, reply) => {
    const firma = req.headers['x-hub-signature-256']
    if (!req.cuerpoCrudo || !c.whatsapp.firmaValida(req.cuerpoCrudo, typeof firma === 'string' ? firma : undefined)) {
      req.log.warn('Webhook de WhatsApp con firma inválida')
      return reply.status(401).send(cuerpoError('FIRMA_INVALIDA', 'Firma inválida'))
    }
    const datos = webhook.safeParse(req.body)
    if (!datos.success) return reply.status(200).send({ recibido: true })
    const mensajes: MensajeEntrante[] = []
    for (const e of datos.data.entry) {
      for (const ch of e.changes) {
        for (const m of ch.value.messages ?? []) {
          mensajes.push({ wamid: m.id, de: m.from, tipo: m.type, texto: m.text?.body, mediaId: m.audio?.id })
        }
      }
    }
    for (const m of mensajes) {
      setImmediate(() => {
        asistente.procesarMensaje(m).catch((err: unknown) => req.log.error({ err: (err as Error).message }, 'Fallo procesando WhatsApp'))
      })
    }
    return reply.status(200).send({ recibido: true })
  })

  // Prueba del asistente desde el panel del admin (mismo flujo, sin WhatsApp).
  app.post('/api/admin/asistente/probar', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const { texto } = probarAsistenteSchema.parse(req.body)
    const r = await asistente.probar(await actor(req), texto)
    if (r.tipo === 'pdf') return { tipo: 'pdf', solicitud: r.solicitud, nombreArchivo: r.nombreArchivo, leyenda: r.leyenda, pdfBase64: r.pdf.toString('base64') }
    return { tipo: 'texto', mensaje: r.mensaje, solicitud: r.solicitud ?? null }
  })

  app.get('/api/admin/asistente/estado', async (req) => {
    exigirPermiso(await actor(req), 'reportes.ver')
    const admins = (await c.uow.repos.usuarios.empleados({})).filter((u) => u.rol === 'admin' && u.activo && u.whatsappHabilitado && u.telefono)
    return {
      whatsapp: c.env.WHATSAPP_PROVEEDOR,
      ia: c.env.IA_PROVEEDOR,
      modeloIa: c.env.IA_PROVEEDOR === 'anthropic' ? c.env.ANTHROPIC_MODEL : null,
      transcripcion: c.env.STT_PROVEEDOR,
      webhook: `${new URL(c.env.WEB_ORIGIN).origin}/api/webhooks/whatsapp`,
      numerosAutorizados: admins.map((u) => `${u.telefono!.slice(0, 6)}•••${u.telefono!.slice(-2)}`),
    }
  })

  // Descarga directa de un reporte del catálogo en PDF.
  app.get('/api/admin/reportes/:tipo/pdf', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { tipo } = z.object({ tipo: z.enum(['ventas', 'productos_mas_vendidos', 'inventario']) }).parse(req.params)
    const q = consultaReporteSchema.extend({ insumo: z.string().trim().max(60).optional() }).parse(req.query)
    exigirPermiso(await actor(req), 'reportes.ver')
    const sede = q.sedeId === 'todas' ? null : ((await c.uow.repos.sedes.porId(q.sedeId))?.nombre ?? null)
    const r = await c.casos.asistente.responderSolicitud({ tipo, sede, periodo: tipo === 'inventario' ? null : (q.periodo ?? (q.desde ? null : 'este_mes')), desde: q.desde ?? null, hasta: q.hasta ?? null, insumo: q.insumo ?? null })
    if (r.tipo !== 'pdf') return reply.status(404).send(cuerpoError('SIN_DATOS', r.mensaje))
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="${r.nombreArchivo}"`).header('Cache-Control', 'no-store').send(r.pdf)
  })
}

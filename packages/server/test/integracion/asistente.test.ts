import { createHmac } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { levantar, Navegador, SECRETO_WHATSAPP, type Entorno } from '../ayudas'

let e: Entorno
beforeAll(async () => {
  e = await levantar()
})
afterAll(async () => {
  await e.cerrar()
})
beforeEach(() => {
  e.whatsapp.length = 0
})

const ADMIN_WA = '573001112233' // +57 300 111 2233 en el seed (admin con WhatsApp habilitado)

function cuerpoWebhook(mensajes: { id: string; from: string; type: string; text?: { body: string }; audio?: { id: string } }[]) {
  return JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages: mensajes } }] }] })
}

async function enviarWebhook(cuerpo: string, firma?: string) {
  return e.app.inject({
    method: 'POST',
    url: '/api/webhooks/whatsapp',
    payload: cuerpo,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma ?? `sha256=${createHmac('sha256', SECRETO_WHATSAPP).update(cuerpo).digest('hex')}` },
  })
}

async function esperarRespuestas(n: number) {
  for (let i = 0; i < 100 && e.whatsapp.length < n; i++) await new Promise((r) => setTimeout(r, 30))
}

describe('webhook de WhatsApp', () => {
  it('verificación del webhook con el token correcto', async () => {
    const ok = await e.app.inject({ method: 'GET', url: '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=token-verificacion-pruebas&hub.challenge=12345' })
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toBe('12345')
    const mal = await e.app.inject({ method: 'GET', url: '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=12345' })
    expect(mal.statusCode).toBe(403)
  })

  it('rechaza mensajes con firma inválida', async () => {
    const cuerpo = cuerpoWebhook([{ id: 'wamid.firma', from: ADMIN_WA, type: 'text', text: { body: 'ventas de hoy' } }])
    expect((await enviarWebhook(cuerpo, 'sha256=deadbeef')).statusCode).toBe(401)
    expect((await enviarWebhook(cuerpo, '')).statusCode).toBe(401)
  })

  it('un admin autorizado pide ventas por texto y recibe un PDF en el mismo chat', async () => {
    const r = await enviarWebhook(cuerpoWebhook([{ id: 'wamid.ventas1', from: ADMIN_WA, type: 'text', text: { body: 'Envíame el reporte de ventas de este mes' } }]))
    expect(r.statusCode).toBe(200)
    await esperarRespuestas(1)
    const [msg] = e.whatsapp
    expect(msg!.para).toBe('+573001112233')
    expect(msg!.pdf!.subarray(0, 5).toString()).toBe('%PDF-')
    expect(msg!.nombre).toMatch(/^rejana-ventas-.*\.pdf$/)
    expect(msg!.texto).toMatch(/Ventas de .* \(todas las sedes\): \$/)
    const [fila] = (await e.c.conexion.db.execute<{ estado: string }>(sql`select estado from whatsapp_mensajes where wamid = 'wamid.ventas1'`)).rows
    expect(fila!.estado).toBe('procesado')
  })

  it('una nota de voz se transcribe y responde con el inventario pedido', async () => {
    await enviarWebhook(cuerpoWebhook([{ id: 'wamid.voz1', from: ADMIN_WA, type: 'audio', audio: { id: 'media-123' } }]))
    await esperarRespuestas(1)
    expect(e.whatsapp[0]!.nombre).toMatch(/^rejana-inventario-/)
    expect(e.whatsapp[0]!.texto).toMatch(/Pan brioche/)
  })

  it('si el audio no se puede escuchar, pide escribir el mensaje', async () => {
    await enviarWebhook(cuerpoWebhook([{ id: 'wamid.voz2', from: ADMIN_WA, type: 'audio', audio: { id: 'audio-roto' } }]))
    await esperarRespuestas(1)
    expect(e.whatsapp[0]!.texto).toMatch(/nota de voz/)
  })

  it('números que no están en la lista blanca se ignoran sin responder ni guardar', async () => {
    await enviarWebhook(cuerpoWebhook([{ id: 'wamid.extrano', from: '573109998877', type: 'text', text: { body: 'ventas de hoy' } }]))
    await new Promise((r) => setTimeout(r, 300))
    expect(e.whatsapp).toHaveLength(0)
    const filas = (await e.c.conexion.db.execute(sql`select 1 from whatsapp_mensajes where wamid = 'wamid.extrano'`)).rows
    expect(filas).toHaveLength(0)
  })

  it('un empleado (no admin) tampoco puede usar el asistente aunque tenga celular', async () => {
    // El domiciliario del seed tiene celular +573008812233
    await enviarWebhook(cuerpoWebhook([{ id: 'wamid.domi', from: '573008812233', type: 'text', text: { body: 'ventas de hoy' } }]))
    await new Promise((r) => setTimeout(r, 300))
    expect(e.whatsapp).toHaveLength(0)
  })

  it('los reintentos de Meta (mismo wamid) no duplican la respuesta', async () => {
    const cuerpo = cuerpoWebhook([{ id: 'wamid.repetido', from: ADMIN_WA, type: 'text', text: { body: 'productos más vendidos de este mes' } }])
    await enviarWebhook(cuerpo)
    await enviarWebhook(cuerpo)
    await esperarRespuestas(1)
    await new Promise((r) => setTimeout(r, 300))
    expect(e.whatsapp).toHaveLength(1)
    expect(e.whatsapp[0]!.nombre).toMatch(/^rejana-productos-/)
  })

  it('si no entiende, responde pidiendo aclaración con ejemplos', async () => {
    await enviarWebhook(cuerpoWebhook([{ id: 'wamid.raro', from: ADMIN_WA, type: 'text', text: { body: 'qué opinas del partido de ayer' } }]))
    await esperarRespuestas(1)
    expect(e.whatsapp[0]!.pdf).toBeUndefined()
    expect(e.whatsapp[0]!.texto).toMatch(/Puedo enviarte estos reportes/)
  })
})

describe('asistente desde el panel del admin', () => {
  it('el admin prueba el asistente y descarga el PDF; otros roles no', async () => {
    const admin = new Navegador(e.app)
    await admin.ingresar('admin@larejana.test')
    const r = await admin.post('/api/admin/asistente/probar', { texto: 'ventas de la semana pasada en Normandía' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ tipo: 'pdf', solicitud: { tipo: 'ventas', sede: 'Normandía', periodo: 'semana_pasada' } })
    expect(Buffer.from(r.json().pdfBase64, 'base64').subarray(0, 5).toString()).toBe('%PDF-')

    const pdf = await admin.get('/api/admin/reportes/inventario/pdf?sedeId=todas')
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')

    const caja = new Navegador(e.app)
    await caja.ingresar('caja.villaluz@larejana.test')
    expect((await caja.post('/api/admin/asistente/probar', { texto: 'ventas de hoy' })).statusCode).toBe(403)
    expect((await caja.get('/api/admin/reportes/ventas/pdf')).statusCode).toBe(403)
  })

  it('una sede inexistente produce una aclaración, no un error', async () => {
    const admin = new Navegador(e.app)
    await admin.ingresar('admin@larejana.test')
    const r = await e.c.casos.asistente.responderSolicitud({ tipo: 'ventas', sede: 'Chapinero', periodo: 'hoy', desde: null, hasta: null, insumo: null })
    expect(r.tipo).toBe('texto')
    if (r.tipo === 'texto') expect(r.mensaje).toMatch(/Chapinero.*Villaluz/)
    void admin
  })
})

import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Logger, MensajeriaWhatsApp } from '../../ports/servicios'

const MAX_MEDIA = 16 * 1024 * 1024

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, cuerpo crudo). Comparación en tiempo constante. */
export function verificarFirmaMeta(secreto: string, cuerpo: Buffer, firma: string | undefined): boolean {
  if (!firma || !firma.startsWith('sha256=')) return false
  const esperada = Buffer.from(`sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`)
  const recibida = Buffer.from(firma)
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida)
}

/** WhatsApp Business Cloud API (Meta Graph). Los números van sin "+" (formato internacional). */
export function whatsappMeta(o: { token: string; phoneNumberId: string; appSecret: string; version: string }, log: Logger): MensajeriaWhatsApp {
  const base = `https://graph.facebook.com/${o.version}`
  const auth = { Authorization: `Bearer ${o.token}` }
  const sinMas = (n: string) => n.replace(/^\+/, '')

  async function enviar(cuerpo: Record<string, unknown>) {
    const res = await fetch(`${base}/${o.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`WhatsApp respondió ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  return {
    async enviarTexto(para, texto) {
      await enviar({ to: sinMas(para), type: 'text', text: { body: texto.slice(0, 4096), preview_url: false } })
    },
    async enviarDocumento(para, documento, nombreArchivo, leyenda) {
      const form = new FormData()
      form.append('messaging_product', 'whatsapp')
      form.append('type', 'application/pdf')
      form.append('file', new Blob([new Uint8Array(documento)], { type: 'application/pdf' }), nombreArchivo)
      const subida = await fetch(`${base}/${o.phoneNumberId}/media`, { method: 'POST', headers: auth, body: form, signal: AbortSignal.timeout(30_000) })
      if (!subida.ok) throw new Error(`No se pudo subir el PDF a WhatsApp (${subida.status})`)
      const { id } = (await subida.json()) as { id: string }
      await enviar({ to: sinMas(para), type: 'document', document: { id, filename: nombreArchivo, caption: leyenda.slice(0, 1024) } })
      log.info({ archivo: nombreArchivo }, 'PDF enviado por WhatsApp')
    },
    async descargarMedia(mediaId) {
      const meta = await fetch(`${base}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(10_000) })
      if (!meta.ok) throw new Error(`No se pudo consultar el audio (${meta.status})`)
      const { url, mime_type, file_size } = (await meta.json()) as { url: string; mime_type: string; file_size?: number }
      if (file_size && file_size > MAX_MEDIA) throw new Error('El audio es demasiado grande')
      // La URL de descarga solo se acepta si es de Meta (evita SSRF si la respuesta fuera manipulada).
      if (!/^https:\/\/([a-z0-9-]+\.)*(fbcdn\.net|facebook\.com|whatsapp\.net)\//i.test(url)) throw new Error('URL de descarga no confiable')
      const archivo = await fetch(url, { headers: auth, signal: AbortSignal.timeout(20_000) })
      if (!archivo.ok) throw new Error(`No se pudo descargar el audio (${archivo.status})`)
      const datos = Buffer.from(await archivo.arrayBuffer())
      if (datos.length > MAX_MEDIA) throw new Error('El audio es demasiado grande')
      return { datos, mime: mime_type }
    },
    firmaValida: (cuerpo, firma) => verificarFirmaMeta(o.appSecret, cuerpo, firma),
  }
}

/** Desarrollo: los mensajes van al log y los PDF a apps/api/tmp/whatsapp. */
export function whatsappConsola(appSecret: string, log: Logger): MensajeriaWhatsApp & { enviados: { para: string; texto?: string; archivo?: string }[] } {
  const enviados: { para: string; texto?: string; archivo?: string }[] = []
  const carpeta = path.resolve(process.cwd(), 'tmp/whatsapp')
  return {
    enviados,
    async enviarTexto(para, texto) {
      enviados.push({ para, texto })
      log.info({ para: `${para.slice(0, 6)}…`, texto }, '💬 WhatsApp (modo consola)')
    },
    async enviarDocumento(para, documento, nombreArchivo, leyenda) {
      await mkdir(carpeta, { recursive: true })
      const archivo = path.join(carpeta, `${Date.now()}-${nombreArchivo}`)
      await writeFile(archivo, documento)
      enviados.push({ para, texto: leyenda, archivo })
      log.info({ archivo, leyenda }, '📄 WhatsApp (modo consola): PDF guardado')
    },
    async descargarMedia() {
      throw new Error('En modo consola no hay notas de voz para descargar')
    },
    firmaValida: (cuerpo, firma) => verificarFirmaMeta(appSecret, cuerpo, firma),
  }
}

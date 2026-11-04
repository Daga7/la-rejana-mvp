import nodemailer from 'nodemailer'
import type { Logger, ServicioCorreo } from '../../ports/servicios'

/** Desarrollo: imprime el correo en el log (incluye los códigos para poder probar). */
export function correoConsola(log: Logger): ServicioCorreo {
  return {
    async enviar(m) {
      log.info({ para: m.para, asunto: m.asunto, texto: m.texto }, '📧 Correo (modo consola)')
    },
  }
}

/** Cualquier servidor SMTP (Mailpit en local; Brevo, SES, Gmail Workspace… en producción). */
export function correoSmtp(opciones: { host: string; puerto: number; seguro: boolean; usuario?: string; clave?: string; remitente: string }): ServicioCorreo {
  const transporte = nodemailer.createTransport({
    host: opciones.host,
    port: opciones.puerto,
    secure: opciones.seguro,
    auth: opciones.usuario ? { user: opciones.usuario, pass: opciones.clave ?? '' } : undefined,
    connectionTimeout: 10_000,
  })
  return {
    async enviar(m) {
      await transporte.sendMail({ from: opciones.remitente, to: m.para, subject: m.asunto, text: m.texto, html: m.html })
    },
  }
}

/** API HTTP de Resend (sin dependencias). */
export function correoResend(apiKey: string, remitente: string): ServicioCorreo {
  return {
    async enviar(m) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: remitente, to: [m.para], subject: m.asunto, text: m.texto, html: m.html }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`)
    },
  }
}

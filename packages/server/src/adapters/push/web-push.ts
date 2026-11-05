import webpush from 'web-push'
import type { Logger, Notificador } from '../../ports/servicios'

/** Web Push con VAPID (estándar; funciona en Chrome, Firefox, Edge y Safari ≥ 16.4 instalado). */
export function notificadorWebPush(opciones: { publica: string; privada: string; sujeto: string }, log: Logger): Notificador {
  webpush.setVapidDetails(opciones.sujeto, opciones.publica, opciones.privada)
  return {
    clavePublica: opciones.publica,
    async enviar(destino, n) {
      try {
        await webpush.sendNotification(
          { endpoint: destino.endpoint, keys: { p256dh: destino.p256dh, auth: destino.auth } },
          JSON.stringify({ titulo: n.titulo, cuerpo: n.cuerpo, url: n.url, etiqueta: n.etiqueta }),
          { TTL: 60 * 60, urgency: 'high', timeout: 8000 },
        )
        return 'ok'
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) return 'expirada'
        log.warn({ status, err: (e as Error).message }, 'Fallo enviando push')
        return 'error'
      }
    },
  }
}

/** Desarrollo sin llaves VAPID: deja la notificación en el log. */
export function notificadorConsola(log: Logger): Notificador {
  return {
    clavePublica: null,
    async enviar(_destino, n) {
      log.info({ titulo: n.titulo, cuerpo: n.cuerpo, url: n.url }, '🔔 Push (modo consola)')
      return 'ok'
    },
  }
}

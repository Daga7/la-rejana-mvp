import type { Transcriptor } from '../../ports/servicios'

const EXTENSION: Record<string, string> = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/webm': 'webm', 'audio/wav': 'wav' }

/**
 * Cualquier API compatible con POST /audio/transcriptions (OpenAI, Groq, etc.). Las notas de voz de
 * WhatsApp llegan en OGG/Opus, formato que estas APIs aceptan directamente.
 */
export function transcriptorOpenAICompatible(o: { baseUrl: string; apiKey: string; modelo: string }): Transcriptor {
  return {
    async transcribir(audio, mime) {
      const tipo = mime.split(';')[0]!.trim()
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(audio)], { type: tipo }), `nota.${EXTENSION[tipo] ?? 'ogg'}`)
      form.append('model', o.modelo)
      form.append('language', 'es')
      form.append('response_format', 'json')
      const res = await fetch(`${o.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${o.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) throw new Error(`La transcripción falló (${res.status})`)
      const json = (await res.json()) as { text?: string }
      return (json.text ?? '').trim()
    },
  }
}

/** Sin proveedor configurado: no transcribe (el asistente pide que escriban el mensaje). */
export const transcriptorSimulado: Transcriptor = {
  async transcribir() {
    throw new Error('Transcripción no configurada')
  },
}

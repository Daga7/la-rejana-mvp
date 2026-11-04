'use client'

import { api } from './api'

function base64UrlABytes(b64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (b64.length % 4)) % 4)
  const crudo = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  const salida = new Uint8Array(new ArrayBuffer(crudo.length))
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i)
  return salida
}

export function pushSoportado(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function esIOSSinInstalar(): boolean {
  if (typeof window === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
  return ios && !instalada
}

/** Pide permiso y suscribe este dispositivo a las notificaciones del pedido. */
export async function activarPush(pedidoId: string, tokenSeguimiento: string | null): Promise<void> {
  if (!pushSoportado()) throw new Error(esIOSSinInstalar() ? 'En iPhone, instala la app en tu pantalla de inicio para recibir avisos.' : 'Tu navegador no soporta notificaciones.')
  const { clave } = await api<{ clave: string | null }>('/push/clave-publica')
  if (!clave) throw new Error('Las notificaciones aún no están configuradas.')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones. Puedes activarlo en la configuración del navegador.')
  const registro = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
  await navigator.serviceWorker.ready
  const sus = (await registro.pushManager.getSubscription()) ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(clave) }))
  const json = sus.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await api('/push/suscripciones', {
    metodo: 'POST',
    cuerpo: { endpoint: json.endpoint, keys: json.keys, pedidoId },
    cabeceras: tokenSeguimiento ? { 'x-pedido-token': tokenSeguimiento } : {},
  })
}

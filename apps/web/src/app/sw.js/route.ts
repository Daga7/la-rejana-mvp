// Service worker servido desde una ruta para que su versión cambie con cada despliegue.
// (Si el archivo cambia, el navegador instala la versión nueva y la app ofrece "Actualizar").

const VERSION = process.env.VERSION_APP ?? 'dev'

const CODIGO = String.raw`/* La Rejana Callejera · service worker ${VERSION} */
const VERSION = '${VERSION}'
const ESTATICO = 'rejana-estatico-' + VERSION
const PAGINAS = 'rejana-paginas-' + VERSION
const DATOS = 'rejana-datos-v1'
const MEDIOS = 'rejana-medios-v1'
const PRECARGA = ['/offline', '/iconos/icono-192.png', '/iconos/icono.svg', '/iconos/badge-96.png', '/marca/logo.webp', '/manifest.webmanifest']
// Solo datos públicos: jamás se guardan respuestas con información personal.
const API_CACHEABLE = [/^\/api\/sedes$/, /^\/api\/sedes\/[0-9a-f-]+\/menu$/]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(ESTATICO).then((c) => c.addAll(PRECARGA)).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => (k.startsWith('rejana-estatico-') || k.startsWith('rejana-paginas-')) && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'ACTIVAR') self.skipWaiting()
})

async function limitar(nombre, maximo) {
  const c = await caches.open(nombre)
  const claves = await c.keys()
  for (let i = 0; i < claves.length - maximo; i++) await c.delete(claves[i])
}

async function redPrimero(req, cache, msTimeout) {
  const c = await caches.open(cache)
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), msTimeout)),
    ])
    if (res && res.ok) c.put(req, res.clone())
    return res
  } catch (err) {
    const guardada = await c.match(req)
    if (guardada) return guardada
    throw err
  }
}

async function cachePrimero(req, cache) {
  const c = await caches.open(cache)
  const guardada = await c.match(req)
  if (guardada) return guardada
  const res = await fetch(req)
  if (res.ok) c.put(req, res.clone())
  return res
}

async function obsoletoMientrasRevalida(req, cache, maximo) {
  const c = await caches.open(cache)
  const guardada = await c.match(req)
  const red = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') {
        c.put(req, res.clone()).then(() => limitar(cache, maximo))
      }
      return res
    })
    .catch(() => guardada)
  return guardada || red
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Teselas del mapa (otro origen): caché con límite.
  if (url.origin !== self.location.origin) {
    if (/tile\./.test(url.hostname) || /basemaps|tiles/.test(url.hostname)) e.respondWith(obsoletoMientrasRevalida(req, MEDIOS, 300))
    return
  }

  if (url.pathname.startsWith('/api/')) {
    if (API_CACHEABLE.some((r) => r.test(url.pathname))) e.respondWith(redPrimero(req, DATOS, 5000))
    return // el resto de la API nunca pasa por la caché
  }

  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(cachePrimero(req, ESTATICO))
    return
  }

  if (/^\/(marca|estados|productos|iconos|pagos)\//.test(url.pathname) || url.pathname.startsWith('/_next/image')) {
    e.respondWith(obsoletoMientrasRevalida(req, MEDIOS, 120))
    return
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      redPrimero(req, PAGINAS, 6000).catch(async () => (await caches.match('/offline')) || new Response('Sin conexión', { status: 503 })),
    )
  }
})

self.addEventListener('push', (e) => {
  let datos = {}
  try {
    datos = e.data ? e.data.json() : {}
  } catch (_) {
    datos = { titulo: 'La Rejana Callejera', cuerpo: e.data ? e.data.text() : '' }
  }
  const titulo = datos.titulo || 'La Rejana Callejera'
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.cuerpo || '',
      icon: '/iconos/icono-192.png',
      badge: '/iconos/badge-96.png',
      tag: datos.etiqueta || 'rejana',
      renotify: true,
      vibrate: [120, 60, 120],
      data: { url: datos.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const destino = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url === destino && 'focus' in v) return v.focus()
      }
      const cualquiera = ventanas.find((v) => 'navigate' in v)
      if (cualquiera) return cualquiera.navigate(destino).then((v) => v && v.focus())
      return self.clients.openWindow(destino)
    }),
  )
})
`

export function GET() {
  return new Response(CODIGO, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  })
}

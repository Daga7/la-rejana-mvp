export interface Punto {
  lat: number
  lng: number
}

const RADIO_TIERRA_KM = 6371

/** Distancia en línea recta (km) entre dos puntos. */
export function distanciaKm(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Enlace de Google Maps con varias paradas (máximo 9 intermedias según Google). */
export function enlaceGoogleMaps(origen: Punto | null, paradas: Punto[]): string {
  if (paradas.length === 0) return 'https://www.google.com/maps'
  const fmt = (p: Punto) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
  const destino = paradas[paradas.length - 1]!
  const intermedias = paradas.slice(0, -1).slice(0, 9)
  const params = new URLSearchParams({ api: '1', destination: fmt(destino), travelmode: 'driving' })
  if (origen) params.set('origin', fmt(origen))
  if (intermedias.length) params.set('waypoints', intermedias.map(fmt).join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Waze solo admite un destino: se abre la siguiente parada. */
export function enlaceWaze(destino: Punto): string {
  return `https://waze.com/ul?ll=${destino.lat.toFixed(6)},${destino.lng.toFixed(6)}&navigate=yes`
}

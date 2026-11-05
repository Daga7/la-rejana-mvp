import { distanciaKm, type Punto } from '@rejana/shared'
import type { Geocodificador, Logger, MatrizTiempos, ResultadoGeo } from '../../ports/servicios'

/** Factor de calle: las vías no son líneas rectas (Bogotá ≈ 1,35). */
const FACTOR_VIAL = 1.35

/** Sin proveedor externo: distancia en línea recta × factor vial ÷ velocidad promedio de una moto. */
export function matrizHaversine(velocidadKmh: number): MatrizTiempos {
  return {
    async minutos(puntos) {
      return puntos.map((a) => puntos.map((b) => (a === b ? 0 : redondear(((distanciaKm(a, b) * FACTOR_VIAL) / velocidadKmh) * 60))))
    },
  }
}

/** OSRM (Open Source Routing Machine). El servidor público es solo para pruebas; en producción, uno propio. */
export function matrizOsrm(baseUrl: string, respaldo: MatrizTiempos, log: Logger): MatrizTiempos {
  return {
    async minutos(puntos) {
      if (puntos.length < 2) return [[0]]
      const coords = puntos.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/table/v1/driving/${coords}?annotations=duration`, { signal: AbortSignal.timeout(4000) })
        if (!res.ok) throw new Error(`OSRM ${res.status}`)
        const json = (await res.json()) as { code: string; durations?: (number | null)[][] }
        if (json.code !== 'Ok' || !json.durations) throw new Error(`OSRM ${json.code}`)
        return json.durations.map((fila) => fila.map((s) => (s === null ? 999 : redondear(s / 60))))
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'OSRM no disponible; se usa la estimación en línea recta')
        return respaldo.minutos(puntos)
      }
    },
  }
}

/** Google Distance Matrix (requiere GOOGLE_MAPS_API_KEY). Máximo 10×10 por solicitud: alcanza para 1 sede + 9 entregas. */
export function matrizGoogle(apiKey: string, respaldo: MatrizTiempos, log: Logger): MatrizTiempos {
  return {
    async minutos(puntos) {
      if (puntos.length > 10) return respaldo.minutos(puntos)
      const lista = puntos.map((p) => `${p.lat},${p.lng}`).join('|')
      const params = new URLSearchParams({ origins: lista, destinations: lista, mode: 'driving', departure_time: 'now', key: apiKey })
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`, { signal: AbortSignal.timeout(5000) })
        const json = (await res.json()) as { status: string; rows: { elements: { status: string; duration_in_traffic?: { value: number }; duration?: { value: number } }[] }[] }
        if (json.status !== 'OK') throw new Error(`Google ${json.status}`)
        return json.rows.map((r) => r.elements.map((e) => (e.status === 'OK' ? redondear((e.duration_in_traffic?.value ?? e.duration?.value ?? 0) / 60) : 999)))
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'Google Distance Matrix no disponible; se usa la estimación en línea recta')
        return respaldo.minutos(puntos)
      }
    },
  }
}

// --- Geocodificación -----------------------------------------------------------------------

/** Nominatim (OpenStreetMap): gratis, máximo 1 solicitud por segundo y User-Agent identificable. */
export function geocoderNominatim(baseUrl: string, log: Logger): Geocodificador {
  let ultima = 0
  const esperar = async () => {
    const falta = ultima + 1100 - Date.now()
    if (falta > 0) await new Promise((r) => setTimeout(r, falta))
    ultima = Date.now()
  }
  const cabeceras = { 'User-Agent': 'LaRejanaCallejera/1.0 (domicilios)', 'Accept-Language': 'es-CO,es' }
  return {
    async buscar(texto, cerca) {
      await esperar()
      const delta = 0.25
      const params = new URLSearchParams({
        q: `${texto}, Bogotá, Colombia`,
        format: 'jsonv2',
        limit: '5',
        countrycodes: 'co',
        viewbox: `${cerca.lng - delta},${cerca.lat + delta},${cerca.lng + delta},${cerca.lat - delta}`,
        bounded: '1',
      })
      try {
        const res = await fetch(`${baseUrl}/search?${params}`, { headers: cabeceras, signal: AbortSignal.timeout(5000) })
        if (!res.ok) throw new Error(`Nominatim ${res.status}`)
        const json = (await res.json()) as { display_name: string; lat: string; lon: string }[]
        return json.map((r) => ({ etiqueta: r.display_name.split(', ').slice(0, 4).join(', '), lat: Number(r.lat), lng: Number(r.lon) }))
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'Nominatim no disponible')
        return []
      }
    },
    async inverso(p) {
      await esperar()
      const params = new URLSearchParams({ lat: String(p.lat), lon: String(p.lng), format: 'jsonv2', zoom: '18', addressdetails: '1' })
      try {
        const res = await fetch(`${baseUrl}/reverse?${params}`, { headers: cabeceras, signal: AbortSignal.timeout(5000) })
        if (!res.ok) return null
        const json = (await res.json()) as { address?: Record<string, string> }
        const a = json.address ?? {}
        const via = [a.road, a.house_number].filter(Boolean).join(' # ')
        return [via, a.neighbourhood ?? a.suburb].filter(Boolean).join(', ') || null
      } catch {
        return null
      }
    },
  }
}

export function geocoderGoogle(apiKey: string, log: Logger): Geocodificador {
  return {
    async buscar(texto, cerca) {
      const params = new URLSearchParams({ address: `${texto}, Bogotá`, components: 'country:CO', bounds: `${cerca.lat - 0.25},${cerca.lng - 0.25}|${cerca.lat + 0.25},${cerca.lng + 0.25}`, key: apiKey, language: 'es' })
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal: AbortSignal.timeout(5000) })
        const json = (await res.json()) as { status: string; results: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[] }
        if (json.status !== 'OK') return []
        return json.results.slice(0, 5).map((r): ResultadoGeo => ({ etiqueta: r.formatted_address, lat: r.geometry.location.lat, lng: r.geometry.location.lng }))
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'Google Geocoding no disponible')
        return []
      }
    },
    async inverso(p) {
      const params = new URLSearchParams({ latlng: `${p.lat},${p.lng}`, key: apiKey, language: 'es' })
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal: AbortSignal.timeout(5000) })
        const json = (await res.json()) as { results: { formatted_address: string }[] }
        return json.results[0]?.formatted_address ?? null
      } catch {
        return null
      }
    },
  }
}

export const geocoderNinguno: Geocodificador = {
  async buscar() {
    return []
  },
  async inverso() {
    return null
  },
}

function redondear(v: number) {
  return Math.round(v * 10) / 10
}

export type { Punto }

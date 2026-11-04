'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect } from 'react'
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Punto } from '@rejana/shared'
import { useConfigPublica } from '@/lib/config-publica'

const pin = (color: string, emoji: string) =>
  L.divIcon({
    className: '',
    iconSize: [40, 48],
    iconAnchor: [20, 46],
    html: `<div style="position:relative;width:40px;height:48px"><svg width="40" height="48" viewBox="0 0 40 48"><path d="M20 47C20 47 37 30 37 18A17 17 0 1 0 3 18C3 30 20 47 20 47Z" fill="${color}" stroke="#14121f" stroke-width="3"/></svg><span style="position:absolute;top:7px;left:0;width:40px;text-align:center;font-size:17px">${emoji}</span></div>`,
  })

export const ICONOS = {
  destino: pin('#e8237d', '🏠'),
  sede: pin('#ffc93c', '🍔'),
  moto: pin('#26bfa9', '🛵'),
}

function Seguidor({ centro, zoom }: { centro: Punto; zoom?: number }) {
  const mapa = useMap()
  useEffect(() => {
    mapa.setView([centro.lat, centro.lng], zoom ?? mapa.getZoom(), { animate: true })
  }, [centro.lat, centro.lng, zoom, mapa])
  return null
}

function Encuadre({ puntos }: { puntos: Punto[] }) {
  const mapa = useMap()
  const clave = puntos.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    if (puntos.length < 2) return
    mapa.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 16, animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, mapa])
  return null
}

function Clics({ onClic }: { onClic: (p: Punto) => void }) {
  useMapEvents({ click: (e) => onClic({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Mapa para elegir el punto de entrega: arrastra el pin o toca el mapa. */
export function MapaEntrega({ punto, onCambiar, sede, radioKm }: { punto: Punto; onCambiar: (p: Punto) => void; sede: Punto; radioKm: number }) {
  const { teselasUrl, atribucionMapa } = useConfigPublica()
  return (
    <MapContainer center={[punto.lat, punto.lng]} zoom={16} scrollWheelZoom={false} className="h-full w-full" attributionControl>
      <TileLayer url={teselasUrl} attribution={atribucionMapa} maxZoom={19} />
      <Circle center={[sede.lat, sede.lng]} radius={radioKm * 1000} pathOptions={{ color: '#26bfa9', weight: 2, fillOpacity: 0.06, dashArray: '6 6' }} />
      <Marker position={[sede.lat, sede.lng]} icon={ICONOS.sede} />
      <Marker
        position={[punto.lat, punto.lng]}
        icon={ICONOS.destino}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const ll = (e.target as L.Marker).getLatLng()
            onCambiar({ lat: ll.lat, lng: ll.lng })
          },
        }}
      />
      <Clics onClic={onCambiar} />
      <Seguidor centro={punto} />
    </MapContainer>
  )
}

/** Mapa de seguimiento: sede, destino y (si va en camino) el domiciliario en vivo. */
export function MapaSeguimiento({ destino, sede, domiciliario }: { destino: Punto; sede: Punto; domiciliario: Punto | null }) {
  const { teselasUrl, atribucionMapa } = useConfigPublica()
  const puntos = domiciliario ? [domiciliario, destino] : [sede, destino]
  return (
    <MapContainer center={[destino.lat, destino.lng]} zoom={15} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer url={teselasUrl} attribution={atribucionMapa} maxZoom={19} />
      <Marker position={[sede.lat, sede.lng]} icon={ICONOS.sede} />
      <Marker position={[destino.lat, destino.lng]} icon={ICONOS.destino} />
      {domiciliario && (
        <>
          <Marker position={[domiciliario.lat, domiciliario.lng]} icon={ICONOS.moto} />
          <Polyline positions={[[domiciliario.lat, domiciliario.lng], [destino.lat, destino.lng]]} pathOptions={{ color: '#e8237d', weight: 4, dashArray: '8 10' }} />
        </>
      )}
      <Encuadre puntos={puntos} />
    </MapContainer>
  )
}

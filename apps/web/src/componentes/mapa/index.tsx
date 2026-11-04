'use client'

import dynamic from 'next/dynamic'

// Leaflet usa `window`: se carga solo en el navegador y en un bloque aparte (no pesa en la carga inicial).
const Cargando = () => <div className="esqueleto-claro h-full w-full !rounded-none" aria-label="Cargando mapa" />

export const MapaEntrega = dynamic(() => import('./MapaLeaflet').then((m) => m.MapaEntrega), { ssr: false, loading: Cargando })
export const MapaSeguimiento = dynamic(() => import('./MapaLeaflet').then((m) => m.MapaSeguimiento), { ssr: false, loading: Cargando })

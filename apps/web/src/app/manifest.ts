import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'La Rejana Callejera',
    short_name: 'La Rejana',
    description: 'Hamburguesas y choriperros a domicilio en Bogotá. Pide y sigue tu pedido en vivo.',
    lang: 'es-CO',
    dir: 'ltr',
    start_url: '/?origen=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#0b0f2b',
    theme_color: '#0b0f2b',
    categories: ['food', 'shopping', 'lifestyle'],
    icons: [
      { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/iconos/icono-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/iconos/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Pedir a domicilio', short_name: 'Pedir', url: '/menu?origen=atajo', icons: [{ src: '/iconos/icono-192.png', sizes: '192x192' }] },
      { name: 'Mis pedidos', short_name: 'Pedidos', url: '/mis-pedidos?origen=atajo', icons: [{ src: '/iconos/icono-192.png', sizes: '192x192' }] },
    ],
    screenshots: [
      { src: '/iconos/splash-1170x2532.png', sizes: '1170x2532', type: 'image/png', form_factor: 'narrow', label: 'La Rejana Callejera' },
    ],
  }
}

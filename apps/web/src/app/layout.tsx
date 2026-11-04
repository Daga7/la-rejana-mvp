import type { Metadata, Viewport } from 'next'
import { Lora, Poppins } from 'next/font/google'
import { headers } from 'next/headers'
import { Avisos } from '@/componentes/Avisos'
import { EstadoConexion } from '@/componentes/EstadoConexion'
import { RegistroServiceWorker } from '@/componentes/RegistroServiceWorker'
import { ProveedorConfig } from '@/lib/config-publica'
import { ProveedorSesion } from '@/lib/sesion'
import './globals.css'

// Solo los pesos que usa la interfaz (cada peso es un archivo que se precarga en todas las páginas).
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '600', '700', '800', '900'], variable: '--fuente-poppins', display: 'swap' })
const lora = Lora({ subsets: ['latin'], weight: ['700'], style: ['italic'], variable: '--fuente-lora', display: 'swap' })

const SPLASH: [number, number, number][] = [
  [375, 667, 2],
  [390, 844, 3],
  [393, 852, 3],
  [428, 926, 3],
  [430, 932, 3],
]

export const metadata: Metadata = {
  title: { default: 'La Rejana Callejera · Domicilios', template: '%s · La Rejana Callejera' },
  description: 'Hamburguesas y choriperros de La Rejana Callejera a domicilio en Bogotá. Pide en segundos y sigue tu pedido en vivo.',
  applicationName: 'La Rejana',
  icons: {
    icon: [
      { url: '/iconos/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/iconos/icono.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/iconos/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'La Rejana',
    statusBarStyle: 'black-translucent',
    startupImage: SPLASH.map(([w, h, r]) => ({
      url: `/iconos/splash-${w * r}x${h * r}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#0b0f2b',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Leer las cabeceras obliga al renderizado dinámico: necesario para el nonce de la CSP.
  await headers()
  const config = {
    tiempoRealUrl: process.env.API_PUBLIC_URL ?? '',
    teselasUrl: process.env.MAPA_TESELAS_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucionMapa: process.env.MAPA_ATRIBUCION ?? '© OpenStreetMap',
  }
  return (
    <html lang="es-CO" className={`${poppins.variable} ${lora.variable}`}>
      <body className="cielo min-h-dvh text-white">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-amarillo focus:px-4 focus:py-2 focus:font-bold focus:text-tinta">
          Saltar al contenido
        </a>
        <ProveedorConfig valor={config}>
          <ProveedorSesion>
            <EstadoConexion />
            {children}
            <Avisos />
          </ProveedorSesion>
        </ProveedorConfig>
        <RegistroServiceWorker />
      </body>
    </html>
  )
}

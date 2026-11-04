import type { CSSProperties, ReactNode } from 'react'

export const COLORES_MARCA = ['#e8237d', '#ffc93c', '#26bfa9', '#6f3fc0', '#f7801e', '#2156d8'] as const

/** Banderines de colores, como en las piezas de redes del restaurante. */
export function Banderines({ alto = 26, cantidad = 36, className = '' }: { alto?: number; cantidad?: number; className?: string }) {
  return (
    <div className={`pointer-events-none relative flex overflow-hidden ${className}`} style={{ height: alto + 6 }} aria-hidden>
      <div className="absolute inset-x-0 top-0 h-[3px] bg-tinta/70" />
      {Array.from({ length: cantidad }, (_, i) => (
        <div
          key={i}
          className="shrink-0 animate-mecer"
          style={{
            width: alto * 1.35,
            height: alto,
            marginTop: 2,
            transformOrigin: '50% 0',
            animationDelay: `${(i % 7) * -0.6}s`,
            animationDuration: `${3.5 + (i % 3)}s`,
          }}
        >
          <div className="h-full w-full" style={{ background: COLORES_MARCA[i % COLORES_MARCA.length], clipPath: 'polygon(4% 0, 96% 0, 50% 100%)' }} />
        </div>
      ))}
    </div>
  )
}

function rng(semilla: number) {
  let a = semilla
  return () => (a = (a * 9301 + 49297) % 233280) / 233280
}

/** Cielo estrellado decorativo (determinístico: igual en servidor y cliente). */
export function Estrellas({ cantidad = 60, semilla = 3, className = '' }: { cantidad?: number; semilla?: number; className?: string }) {
  const r = rng(semilla)
  const puntos = Array.from({ length: cantidad }, () => ({ x: Math.round(r() * 1000), y: Math.round(r() * 1000), rad: 1.2 + r() * 2.2, o: 0.3 + r() * 0.6, d: r() * 4 }))
  return (
    <svg className={`pointer-events-none absolute inset-0 -z-10 h-full w-full ${className}`} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.rad} fill="#fff" opacity={p.o} className={i % 3 === 0 ? 'animate-titilar' : undefined} style={{ animationDelay: `${p.d}s` } as CSSProperties} />
      ))}
    </svg>
  )
}

export function Titulo({ acento, principal, tamano = 'md', className = '' }: { acento?: ReactNode; principal: ReactNode; tamano?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = { sm: 'text-2xl sm:text-3xl', md: 'text-3xl sm:text-4xl', lg: 'text-4xl sm:text-6xl' }[tamano]
  return (
    <div className={className}>
      {acento && <div className="acento text-lg sm:text-xl">{acento}</div>}
      <h1 className={`titulo ${t}`}>{principal}</h1>
    </div>
  )
}

/** Sello de la marca (la "R" en sticker rosa). */
export function SelloR({ tamano = 44, className = '' }: { tamano?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/iconos/icono.svg" width={tamano} height={tamano} alt="" aria-hidden className={`shrink-0 rounded-[22%] ${className}`} />
  )
}

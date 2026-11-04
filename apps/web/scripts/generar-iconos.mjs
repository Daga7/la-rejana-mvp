// Genera los íconos de la PWA y las pantallas de inicio de iOS a partir de un SVG vectorial.
// Uso: pnpm --filter @rejana/web iconos
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SALIDA = path.resolve('public/iconos')
const NOCHE = '#0b0f2b'
const NOCHE_2 = '#121842'
const TINTA = '#14121f'
const COLORES = ['#e8237d', '#ffc93c', '#26bfa9', '#6f3fc0', '#f7801e', '#2156d8']

// "R" en negrita dibujada como trazo (no depende de fuentes instaladas). Caja 190×240.
const R = 'M0 0H112C162 0 192 30 192 76C192 109 174 133 144 143L198 240H140L95 152H54V240H0ZM54 46V108H106C128 108 140 96 140 77C140 58 128 46 106 46Z'

function banderines(ancho, y, tam) {
  let out = `<path d="M0 ${y} Q${ancho / 2} ${y + tam * 0.35} ${ancho} ${y}" stroke="${TINTA}" stroke-width="${tam * 0.08}" fill="none"/>`
  const n = Math.ceil(ancho / tam)
  for (let i = 0; i < n; i++) {
    const x = i * tam
    const curva = Math.sin((i / (n - 1 || 1)) * Math.PI) * tam * 0.17
    out += `<path d="M${x + tam * 0.06} ${y + curva} L${x + tam * 0.94} ${y + curva} L${x + tam / 2} ${y + curva + tam * 0.95} Z" fill="${COLORES[i % COLORES.length]}" stroke="${TINTA}" stroke-width="${tam * 0.05}" stroke-linejoin="round"/>`
  }
  return out
}

function estrellas(ancho, alto, cantidad, semilla = 7) {
  let a = semilla
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280)
  let out = ''
  for (let i = 0; i < cantidad; i++) {
    out += `<circle cx="${(rnd() * ancho).toFixed(1)}" cy="${(rnd() * alto).toFixed(1)}" r="${(1 + rnd() * 2.6).toFixed(1)}" fill="#fff" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`
  }
  return out
}

/** Sticker rosa con la R, centrado en (cx, cy) con lado `lado`. */
function sticker(cx, cy, lado) {
  const x = cx - lado / 2
  const y = cy - lado / 2
  const borde = lado * 0.045
  const sombra = lado * 0.05
  const escala = (lado * 0.62) / 240
  const rx = cx - (192 * escala) / 2
  const ry = cy - (240 * escala) / 2 + lado * 0.01
  return `
  <rect x="${x + sombra}" y="${y + sombra}" width="${lado}" height="${lado}" rx="${lado * 0.2}" fill="${TINTA}"/>
  <rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${lado * 0.2}" fill="#e8237d" stroke="${TINTA}" stroke-width="${borde}"/>
  <g transform="translate(${rx + lado * 0.03} ${ry + lado * 0.03}) scale(${escala})"><path d="${R}" fill="${TINTA}"/></g>
  <g transform="translate(${rx} ${ry}) scale(${escala})"><path d="${R}" fill="#fff" stroke="${TINTA}" stroke-width="${10 / escala / 2.2}" stroke-linejoin="round"/></g>
  <circle cx="${x + lado * 0.83}" cy="${y + lado * 0.18}" r="${lado * 0.055}" fill="#ffc93c" stroke="${TINTA}" stroke-width="${borde * 0.6}"/>`
}

function icono({ tam, redondeado, escalaContenido = 1 }) {
  const c = tam / 2
  const lado = tam * 0.56 * escalaContenido
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NOCHE}"/><stop offset="1" stop-color="${NOCHE_2}"/></linearGradient>
  <clipPath id="c"><rect width="${tam}" height="${tam}" rx="${redondeado ? tam * 0.22 : 0}"/></clipPath></defs>
  <g clip-path="url(#c)">
    <rect width="${tam}" height="${tam}" fill="url(#g)"/>
    ${estrellas(tam, tam, Math.round(tam / 14))}
    ${banderines(tam, tam * (redondeado ? 0.1 : 0.06), tam * 0.125)}
    ${sticker(c, c + tam * 0.07, lado)}
  </g></svg>`
}

function splash(ancho, alto) {
  const lado = Math.min(ancho, alto) * 0.34
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NOCHE}"/><stop offset="1" stop-color="${NOCHE_2}"/></linearGradient></defs>
  <rect width="${ancho}" height="${alto}" fill="url(#g)"/>
  ${estrellas(ancho, alto, 140, 11)}
  ${banderines(ancho, alto * 0.04, ancho * 0.1)}
  ${sticker(ancho / 2, alto / 2, lado)}
</svg>`
}

await mkdir(SALIDA, { recursive: true })
const png = (svg, archivo, w, h = w) => sharp(Buffer.from(svg)).resize(w, h).png({ compressionLevel: 9 }).toFile(path.join(SALIDA, archivo))

await writeFile(path.join(SALIDA, 'icono.svg'), icono({ tam: 512, redondeado: true }))
await png(icono({ tam: 512, redondeado: true }), 'icono-192.png', 192)
await png(icono({ tam: 512, redondeado: true }), 'icono-512.png', 512)
// Maskable: fondo a sangre y contenido dentro de la zona segura (círculo del 80 %).
await png(icono({ tam: 512, redondeado: false, escalaContenido: 0.86 }), 'icono-maskable-512.png', 512)
await png(icono({ tam: 512, redondeado: false, escalaContenido: 0.86 }), 'icono-maskable-192.png', 192)
await png(icono({ tam: 512, redondeado: false }), 'apple-touch-icon.png', 180)
await png(icono({ tam: 512, redondeado: true }), 'favicon-32.png', 32)
await png(icono({ tam: 512, redondeado: false, escalaContenido: 0.9 }), 'badge-96.png', 96)

// Pantallas de inicio de iOS (iPhone más comunes). Android las arma con el manifest.
const SPLASH = [
  [750, 1334],
  [1170, 2532],
  [1179, 2556],
  [1284, 2778],
  [1290, 2796],
]
for (const [w, h] of SPLASH) await png(splash(w, h), `splash-${w}x${h}.png`, w, h)
console.log('✔ Íconos y splash generados en', SALIDA)

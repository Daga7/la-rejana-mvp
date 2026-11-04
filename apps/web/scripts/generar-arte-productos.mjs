// Ilustraciones planas con contorno negro (estilo sticker de la marca) para los productos de ejemplo.
// Son marcadores de posición hasta tener fotos reales. Uso: node scripts/generar-arte-productos.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const T = '#14121f'
const PAN = '#f2a541'
const SALIDA = path.resolve('public/productos')

const marco = (fondo, contenido) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img">
<rect width="400" height="300" fill="${fondo}"/>
<circle cx="200" cy="160" r="128" fill="#ffffff" opacity=".18"/>
<g fill="#fff" opacity=".55"><circle cx="48" cy="42" r="3"/><circle cx="352" cy="58" r="2.5"/><circle cx="330" cy="250" r="3"/><circle cx="70" cy="240" r="2"/><path d="M340 120 q0 10 10 10 q-10 0 -10 10 q0 -10 -10 -10 q10 0 10 -10z"/><path d="M62 132 q0 8 8 8 q-8 0 -8 8 q0 -8 -8 -8 q8 0 8 -8z"/></g>
<ellipse cx="200" cy="262" rx="138" ry="16" fill="${T}" opacity=".25"/>
<g stroke="${T}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${contenido}</g>
</svg>`

const semillas = (y) =>
  [[150, y + 22], [185, y + 12], [220, y + 14], [252, y + 26], [205, y + 34], [170, y + 36]]
    .map(([x, yy], i) => `<ellipse cx="${x}" cy="${yy}" rx="6" ry="3.4" fill="#fff6dc" stroke-width="2.5" transform="rotate(${i * 22 - 30} ${x} ${yy})"/>`)
    .join('')

function hamburguesa({ carnes = 1, quesos = 1, extras = '' }) {
  const capas = []
  let y = 218
  capas.push(`<path d="M88 ${y} H312 Q312 ${y + 30} 280 ${y + 30} H120 Q88 ${y + 30} 88 ${y}Z" fill="${PAN}"/>`)
  for (let i = 0; i < carnes; i++) {
    y -= 30
    capas.push(`<rect x="80" y="${y}" width="240" height="32" rx="16" fill="#6b3a22"/>`)
    capas.push(`<path d="M110 ${y + 10} h22 M160 ${y + 14} h26 M220 ${y + 10} h22 M270 ${y + 15} h18" stroke="#3d1f10" stroke-width="4"/>`)
    if (i < quesos) {
      capas.push(`<path d="M84 ${y - 2} H316 L306 ${y + 14} H280 L268 ${y + 30} L256 ${y + 14} H150 L138 ${y + 26} L126 ${y + 14} H94Z" fill="#ffc93c"/>`)
    }
  }
  capas.push(extras.replaceAll('{y}', String(y)))
  const yPan = y - (extras ? 26 : 8)
  capas.push(`<path d="M86 ${yPan} Q86 ${yPan - 92} 200 ${yPan - 92} Q314 ${yPan - 92} 314 ${yPan}Z" fill="${PAN}"/>`)
  capas.push(`<path d="M118 ${yPan - 40} Q132 ${yPan - 74} 170 ${yPan - 80}" fill="none" stroke="#ffd98a" stroke-width="7"/>`)
  capas.push(semillas(yPan - 84))
  return capas.join('\n')
}

function choriperro({ toppings = '', salsas = ['#f6a5c0', '#ffc93c'] }) {
  return `
  <path d="M58 196 Q58 160 96 160 H304 Q342 160 342 196 Q342 236 300 236 H100 Q58 236 58 196Z" fill="#e8b467"/>
  <path d="M84 214 H316" stroke="#c98b4b" stroke-width="5"/>
  <rect x="70" y="146" width="260" height="46" rx="23" fill="#b5452b"/>
  <path d="M110 152 l14 32 M150 152 l14 32 M190 152 l14 32 M230 152 l14 32 M270 152 l12 28" stroke="#6b2412" stroke-width="7"/>
  ${toppings}
  <path d="M86 146 q14 -16 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0" fill="none" stroke="${salsas[0]}" stroke-width="9"/>
  <path d="M96 140 q14 -14 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0" fill="none" stroke="${salsas[1]}" stroke-width="6"/>
  <g fill="#ffd166" stroke-width="2.5">${Array.from({ length: 16 }, (_, i) => `<rect x="${92 + i * 14}" y="${118 - (i % 3) * 6}" width="9" height="7" rx="2" transform="rotate(${i * 27} ${96 + i * 14} ${121 - (i % 3) * 6})"/>`).join('')}</g>`
}

const productos = {
  'la-rejana': marco(
    '#e8237d',
    hamburguesa({
      carnes: 2,
      quesos: 2,
      extras: `<path d="M92 {y} q22 -14 44 0 t44 0 t44 0 t44 0 t44 0" fill="none" stroke="#b33a2b" stroke-width="12"/><path d="M100 {y} q18 -10 36 0 t36 0 t36 0 t36 0 t36 0 t36 0" fill="none" stroke="#8a5a2b" stroke-width="5"/>`,
    }),
  ),
  'la-callejera': marco(
    '#26bfa9',
    hamburguesa({
      carnes: 1,
      quesos: 1,
      extras: `<path d="M80 {y} q15 -16 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" fill="#5bb04b"/><rect x="106" y="calc({y} - 20)" width="0" height="0"/><ellipse cx="150" cy="{y}" rx="40" ry="10" fill="#e5533d"/><ellipse cx="250" cy="{y}" rx="40" ry="10" fill="#e5533d"/>`,
    }),
  ),
  'la-parchada': marco(
    '#f7801e',
    hamburguesa({
      carnes: 1,
      quesos: 0,
      extras: `<rect x="92" y="calc({y} - 4)" width="0" height="0"/><path d="M90 {y} H310 L300 calc({y})Z" fill="none"/><rect x="96" y="{y}" width="208" height="0" fill="none"/><ellipse cx="150" cy="{y}" rx="52" ry="12" fill="#ffe08a"/><ellipse cx="255" cy="{y}" rx="52" ry="12" fill="#fff6e0"/><path d="M118 {y} q30 -12 60 0 t60 0 t60 0" fill="none" stroke="#d9472b" stroke-width="7"/>`,
    }),
  ),
  'choriperro-clasico': marco('#ffc93c', choriperro({})),
  'choriperro-rejano': marco(
    '#6f3fc0',
    choriperro({
      toppings: `<path d="M80 150 q20 -18 40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="#fff6e0"/><path d="M110 132 l24 -8 M160 128 l26 6 M220 126 l24 -6 M262 134 l22 6" stroke="#b33a2b" stroke-width="9"/><g fill="#e0a64a" stroke-width="2.5"><circle cx="130" cy="110" r="7"/><circle cx="176" cy="104" r="6"/><circle cx="226" cy="108" r="7"/><circle cx="268" cy="104" r="6"/></g>`,
      salsas: ['#fff6e0', '#e8237d'],
    }),
  ),
  'choriperro-ranchero': marco(
    '#2156d8',
    choriperro({
      toppings: `<g><ellipse cx="128" cy="128" rx="20" ry="14" fill="#fff"/><circle cx="128" cy="128" r="7" fill="#ffb703"/><ellipse cx="200" cy="122" rx="20" ry="14" fill="#fff"/><circle cx="200" cy="122" r="7" fill="#ffb703"/><ellipse cx="272" cy="128" rx="20" ry="14" fill="#fff"/><circle cx="272" cy="128" r="7" fill="#ffb703"/></g>`,
      salsas: ['#fff6e0', '#ffc93c'],
    }),
  ),
}

await mkdir(SALIDA, { recursive: true })
for (const [slug, svg] of Object.entries(productos)) {
  // Limpia marcadores auxiliares calc() que no son SVG válido.
  const limpio = svg.replace(/<rect x="[^"]*" y="calc\([^"]*\)" width="0" height="0"\/>/g, '').replace(/<path d="M90 [^"]*calc\([^"]*\)Z" fill="none"\/>/g, '').replace(/<rect x="96" y="[^"]*" width="208" height="0" fill="none"\/>/g, '')
  await writeFile(path.join(SALIDA, `${slug}.svg`), limpio)
}
console.log('✔ Ilustraciones de productos en', SALIDA)

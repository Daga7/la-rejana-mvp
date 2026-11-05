import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import type { DocumentoReporte, GeneradorPdf } from '../../ports/servicios'

// Reportes en PDF con la identidad de La Rejana Callejera, dibujados en vectores (sin navegador).
// Las gráficas siguen la misma guía de las del tablero: paleta de marca validada para daltonismo,
// un solo eje, marcas delgadas, valores en la punta y leyenda cuando hay más de una serie.

const C = {
  noche: '#0b0f2b',
  noche300: '#a3a8d1',
  crema: '#fbf4e6',
  crema200: '#f2e7cf',
  tinta: '#14121f',
  tintaSoft: '#4a4658',
  rejilla: '#e8ddc6',
  amarillo: '#ffc93c',
  series: ['#2156d8', '#e8237d', '#c95f06'],
  banderines: ['#e8237d', '#ffc93c', '#26bfa9', '#6f3fc0', '#f7801e', '#2156d8'],
}

const ANCHO = 595.28
const ALTO = 841.89
const M = 40

function carpetaAssets(): string {
  const candidatos = [process.env.ASSETS_DIR, path.resolve(process.cwd(), 'assets'), path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets')].filter(Boolean) as string[]
  return candidatos.find((c) => existsSync(path.join(c, 'logo.png'))) ?? candidatos[0]!
}

function compacto(v: number, formato: 'pesos' | 'numero'): string {
  const n = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })
  const prefijo = formato === 'pesos' ? '$ ' : ''
  if (Math.abs(v) >= 1_000_000) return `${prefijo}${n.format(v / 1_000_000)} M`
  if (Math.abs(v) >= 10_000) return `${prefijo}${n.format(v / 1_000)} mil`
  return `${prefijo}${n.format(v)}`
}

function escala(maximo: number): { tope: number; ticks: number[] } {
  if (maximo <= 0) return { tope: 1, ticks: [0, 1] }
  const crudo = maximo / 4
  const potencia = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo) ?? 10 * potencia
  const tope = Math.ceil(maximo / paso) * paso
  return { tope, ticks: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) }
}

export function generadorPdfkit(): GeneradorPdf {
  const assets = carpetaAssets()
  const fuente = (archivo: string) => path.join(assets, 'fuentes', archivo)
  const hayFuentes = existsSync(fuente('Poppins-Regular.ttf'))

  return {
    generar(d: DocumentoReporte): Promise<Buffer> {
      return new Promise((resolver, rechazar) => {
        const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: d.titulo, Author: 'La Rejana Callejera', Subject: d.subtitulo, Creator: 'La Rejana Callejera' } })
        const partes: Buffer[] = []
        doc.on('data', (b: Buffer) => partes.push(b))
        doc.on('end', () => resolver(Buffer.concat(partes)))
        doc.on('error', rechazar)

        if (hayFuentes) {
          doc.registerFont('Texto', fuente('Poppins-Regular.ttf'))
          doc.registerFont('Semi', fuente('Poppins-SemiBold.ttf'))
          doc.registerFont('Negrita', fuente('Poppins-Bold.ttf'))
          doc.registerFont('Titulo', fuente('Poppins-Black.ttf'))
          doc.registerFont('Acento', fuente('Lora-Italic.ttf'))
        } else {
          doc.registerFont('Texto', 'Helvetica')
          doc.registerFont('Semi', 'Helvetica-Bold')
          doc.registerFont('Negrita', 'Helvetica-Bold')
          doc.registerFont('Titulo', 'Helvetica-Bold')
          doc.registerFont('Acento', 'Times-Italic')
        }

        // --- Encabezado ------------------------------------------------------------------------
        doc.rect(0, 0, ANCHO, 112).fill(C.noche)
        let semilla = 7
        const rnd = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280)
        for (let i = 0; i < 45; i++) doc.circle(rnd() * ANCHO, rnd() * 108, 0.6 + rnd() * 1.2).fillOpacity(0.35 + rnd() * 0.5).fill('#ffffff')
        doc.fillOpacity(1)
        doc.circle(M + 30, 54, 31).fill(C.crema)
        const logo = path.join(assets, 'logo.png')
        if (existsSync(logo)) doc.image(logo, M + 4, 28, { width: 52, height: 52 })
        doc.font('Acento').fontSize(12).fillColor(C.amarillo).text('La Rejana Callejera', M + 76, 26)
        doc.font('Titulo').fontSize(21).fillColor('#ffffff').text(d.titulo.toUpperCase(), M + 76, 42, { width: ANCHO - M * 2 - 76, lineBreak: false })
        doc.font('Texto').fontSize(9.5).fillColor(C.noche300).text(d.subtitulo, M + 76, 74, { width: ANCHO - M * 2 - 76 })

        // Banderines
        const tam = 26
        doc.moveTo(0, 112).lineTo(ANCHO, 112).lineWidth(1.5).stroke(C.tinta)
        for (let i = 0, x = 0; x < ANCHO; i++, x += tam) {
          doc.polygon([x + 1.5, 112], [x + tam - 1.5, 112], [x + tam / 2, 128]).fill(C.banderines[i % C.banderines.length]!)
        }

        let y = 146

        // --- Indicadores (tipo sticker) -------------------------------------------------------------
        if (d.indicadores.length) {
          const n = d.indicadores.length
          const gap = 10
          const w = (ANCHO - M * 2 - gap * (n - 1)) / n
          d.indicadores.forEach((ind, i) => {
            const x = M + i * (w + gap)
            doc.roundedRect(x + 2.5, y + 2.5, w, 58, 9).fill(C.tinta)
            doc.roundedRect(x, y, w, 58, 9).lineWidth(1.4).fillAndStroke(C.crema, C.tinta)
            doc.font('Texto').fontSize(8).fillColor(C.tintaSoft).text(ind.etiqueta, x + 10, y + 9, { width: w - 20 })
            doc.font('Semi').fontSize(15).fillColor(C.tinta)
            doc.text(recortar(doc, ind.valor, w - 20), x + 10, y + 26, { lineBreak: false })
          })
          y += 80
        }

        // --- Gráfica --------------------------------------------------------------------------------
        if (d.grafica && d.grafica.etiquetas.length) {
          const g = d.grafica
          doc.font('Negrita').fontSize(11).fillColor(C.tinta).text(g.titulo, M, y)
          y += 18
          if (g.series.length > 1) {
            let lx = M
            g.series.forEach((s, k) => {
              doc.moveTo(lx, y + 5).lineTo(lx + 14, y + 5).lineWidth(2.2).stroke(C.series[k % 3]!)
              doc.font('Semi').fontSize(8).fillColor(C.tinta).text(s.nombre, lx + 18, y + 1, { lineBreak: false })
              lx += 26 + doc.widthOfString(s.nombre)
            })
            y += 16
          }
          const alto = g.tipo === 'barras_horizontales' ? Math.min(240, g.etiquetas.length * 22 + 6) : 180
          if (g.tipo === 'barras_horizontales') dibujarHorizontales(doc, g, M, y, ANCHO - M * 2, alto)
          else dibujarTiempo(doc, g, M, y, ANCHO - M * 2, alto)
          y += alto + (g.tipo === 'barras_horizontales' ? 14 : 30)
        }

        // --- Tabla ------------------------------------------------------------------------------------
        const t = d.tabla
        doc.font('Negrita').fontSize(11).fillColor(C.tinta).text(t.titulo, M, y)
        y += 18
        const anchoTabla = ANCHO - M * 2
        const anchos = t.columnas.map((_, i) => (i === 0 ? anchoTabla * (t.columnas.length > 3 ? 0.34 : 0.46) : (anchoTabla * (t.columnas.length > 3 ? 0.66 : 0.54)) / (t.columnas.length - 1)))
        const encabezado = () => {
          doc.rect(M, y, anchoTabla, 20).fill(C.tinta)
          let x = M
          t.columnas.forEach((col, i) => {
            doc.font('Negrita').fontSize(8).fillColor('#ffffff').text(col.titulo.toUpperCase(), x + 6, y + 6, { width: anchos[i]! - 12, align: col.alineacion === 'derecha' ? 'right' : 'left', lineBreak: false })
            x += anchos[i]!
          })
          y += 20
        }
        encabezado()
        t.filas.forEach((fila, r) => {
          if (y > ALTO - 70) {
            doc.addPage()
            y = M
            encabezado()
          }
          doc.rect(M, y, anchoTabla, 18).fill(r % 2 === 0 ? '#ffffff' : C.crema)
          let x = M
          fila.forEach((celda, i) => {
            const col = t.columnas[i]!
            doc.font(i === 0 ? 'Semi' : 'Texto').fontSize(8.5).fillColor(C.tinta)
            doc.text(recortar(doc, celda, anchos[i]! - 12), x + 6, y + 4.5, { width: anchos[i]! - 12, align: col.alineacion === 'derecha' ? 'right' : 'left', lineBreak: false })
            x += anchos[i]!
          })
          y += 18
        })
        doc.moveTo(M, y).lineTo(M + anchoTabla, y).lineWidth(1).stroke(C.tinta)
        y += 14

        for (const nota of d.notas ?? []) {
          if (y > ALTO - 70) {
            doc.addPage()
            y = M
          }
          doc.font('Texto').fontSize(8).fillColor(C.tintaSoft).text(nota, M, y, { width: anchoTabla })
          y = doc.y + 4
        }

        // --- Pie de página en todas las páginas ---------------------------------------------------------
        const fecha = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' }).format(d.generadoEn)
        const rango = doc.bufferedPageRange()
        for (let i = rango.start; i < rango.start + rango.count; i++) {
          doc.switchToPage(i)
          doc.font('Texto').fontSize(7.5).fillColor(C.tintaSoft).text(`La Rejana Callejera · Generado el ${fecha} · Página ${i + 1} de ${rango.count}`, M, ALTO - 30, { width: ANCHO - M * 2, align: 'center', lineBreak: false })
        }
        doc.end()
      })
    },
  }
}

type Doc = PDFKit.PDFDocument
type Grafica = NonNullable<DocumentoReporte['grafica']>

/** Recorta un texto con «…» para que quepa en una sola línea del ancho dado (fuente y tamaño ya fijados). */
function recortar(doc: Doc, texto: string, ancho: number): string {
  if (doc.widthOfString(texto) <= ancho) return texto
  let t = texto
  while (t.length > 1 && doc.widthOfString(`${t}…`) > ancho) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/** Barras verticales (una serie) o líneas (varias series) a lo largo del tiempo, con un solo eje. */
function dibujarTiempo(doc: Doc, g: Grafica, x0: number, y0: number, ancho: number, alto: number) {
  const izq = 52
  const abajo = 18
  const plotX = x0 + izq
  const plotW = ancho - izq - (g.tipo === 'lineas' ? 70 : 6)
  const plotH = alto - abajo
  const n = g.etiquetas.length
  const { tope, ticks } = escala(Math.max(1, ...g.series.flatMap((s) => s.valores)))
  const yv = (v: number) => y0 + plotH * (1 - v / tope)
  for (const t of ticks) {
    doc.moveTo(plotX, yv(t)).lineTo(plotX + plotW, yv(t)).lineWidth(0.5).stroke(C.rejilla)
    doc.font('Texto').fontSize(7).fillColor(C.tintaSoft).text(compacto(t, g.formato), x0, yv(t) - 4, { width: izq - 6, align: 'right', lineBreak: false })
  }
  const pasoEtiqueta = Math.max(1, Math.ceil(n / 8))
  const xc = (i: number) => plotX + (n === 1 ? plotW / 2 : (g.tipo === 'barras' ? (i + 0.5) * (plotW / n) : (i * plotW) / (n - 1)))
  // Una etiqueta cada `pasoEtiqueta` días más la última; se omite la penúltima si quedaría encima.
  const marcas = g.etiquetas.map((_, i) => i).filter((i) => i % pasoEtiqueta === 0 && n - 1 - i >= pasoEtiqueta * 0.75)
  if (!marcas.includes(n - 1)) marcas.push(n - 1)
  for (const i of marcas) {
    const et = g.etiquetas[i]!
    const alinear = i === n - 1 && g.tipo !== 'barras' ? 'right' : i === 0 && g.tipo !== 'barras' ? 'left' : 'center'
    const x = alinear === 'right' ? xc(i) - 50 : alinear === 'left' ? xc(i) : xc(i) - 25
    doc.font('Texto').fontSize(7).fillColor(C.tintaSoft).text(et, x, y0 + plotH + 5, { width: 50, align: alinear, lineBreak: false })
  }
  if (g.tipo === 'barras') {
    const s = g.series[0]!
    const w = Math.min(16, (plotW / n) * 0.62)
    const maxIdx = s.valores.indexOf(Math.max(...s.valores))
    s.valores.forEach((v, i) => {
      if (v <= 0) return
      const h = plotH * (v / tope)
      const x = xc(i) - w / 2
      // Punta redondeada de 3 pt y base recta sobre la línea base.
      doc.roundedRect(x, yv(v), w, h, Math.min(3, w / 2)).fill(C.series[0]!)
      doc.rect(x, yv(v) + Math.min(3, h / 2), w, Math.max(0, h - Math.min(3, h / 2))).fill(C.series[0]!)
      if (i === maxIdx) doc.font('Semi').fontSize(7).fillColor(C.tinta).text(compacto(v, g.formato), xc(i) - 30, yv(v) - 11, { width: 60, align: 'center', lineBreak: false })
    })
  } else {
    g.series.forEach((s, k) => {
      const color = C.series[k % 3]!
      s.valores.forEach((v, i) => (i === 0 ? doc.moveTo(xc(i), yv(v)) : doc.lineTo(xc(i), yv(v))))
      doc.lineWidth(1.6).lineJoin('round').lineCap('round').stroke(color)
      const ultimo = s.valores.at(-1) ?? 0
      doc.circle(xc(n - 1), yv(ultimo), 3.2).lineWidth(1.5).fillAndStroke(color, '#ffffff')
      doc.font('Semi').fontSize(7.5).fillColor(C.tinta).text(s.nombre, xc(n - 1) + 7, yv(ultimo) - 4 + k * 0, { width: 64, lineBreak: false, ellipsis: true })
    })
  }
  doc.moveTo(plotX, y0 + plotH).lineTo(plotX + plotW, y0 + plotH).lineWidth(0.8).stroke(C.tintaSoft)
}

/** Barras horizontales ordenadas (una serie, un solo tono) con el valor en la punta. */
function dibujarHorizontales(doc: Doc, g: Grafica, x0: number, y0: number, ancho: number, alto: number) {
  const s = g.series[0]!
  const etiquetaW = ancho * 0.34
  const valorW = 70
  const barraMax = ancho - etiquetaW - valorW - 8
  const maximo = Math.max(1, ...s.valores)
  const fila = Math.min(22, alto / Math.max(1, g.etiquetas.length))
  const grosor = Math.min(14, fila * 0.62)
  g.etiquetas.forEach((et, i) => {
    const yc = y0 + i * fila + fila / 2
    const v = s.valores[i] ?? 0
    const w = Math.max(1, barraMax * (v / maximo))
    doc.font('Semi').fontSize(8.5).fillColor(C.tinta)
    doc.text(recortar(doc, et, etiquetaW - 10), x0, yc - 5, { lineBreak: false })
    const bx = x0 + etiquetaW
    doc.roundedRect(bx, yc - grosor / 2, w, grosor, Math.min(3, w / 2)).fill(C.series[0]!)
    doc.rect(bx, yc - grosor / 2, Math.max(0, w - 3), grosor).fill(C.series[0]!)
    doc.font('Semi').fontSize(8).fillColor(C.tinta).text(compacto(v, g.formato), bx + w + 6, yc - 4.5, { width: valorW, lineBreak: false })
  })
}

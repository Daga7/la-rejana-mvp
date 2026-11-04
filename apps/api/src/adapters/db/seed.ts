import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { VERSION_PRIVACIDAD } from '@rejana/shared'
import { hasherBcrypt } from '../seguridad/hasher-bcrypt'
import { conectarBD, type BaseDatos } from './cliente'
import { crearRepositorios } from './repos'
import * as t from './schema'

// Datos de prueba para desarrollo. NO se ejecuta en producción (ver guardia al final).
// Contraseña de todos los usuarios de prueba: Rejana2026*

export const CLAVE_DEMO = 'Rejana2026*'

/** Generador pseudoaleatorio determinístico (mulberry32) para que el histórico sea siempre igual. */
function rng(semilla: number) {
  let a = semilla >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
  }
}

const SEDES = [
  {
    slug: 'villaluz',
    nombre: 'Villaluz',
    direccion: 'Calle 66A # 77-21',
    barrio: 'Villaluz',
    telefono: '+573163582301',
    lat: 4.68862,
    lng: -74.10945,
    horaApertura: '12:00',
    horaCierre: '22:30',
    tarifaDomicilio: 5000,
    limiteMinutosEntrega: 25,
    minutosPreparacion: 20,
    radioEntregaKm: 5,
    qrPagoUrl: '/pagos/qr-ejemplo.svg',
    qrPagoInstrucciones: 'Escanea el código con Nequi o Bancolombia por el valor exacto y muéstrale el comprobante al domiciliario.',
  },
  {
    slug: 'normandia',
    nombre: 'Normandía',
    direccion: 'Avenida Boyacá # 52-30',
    barrio: 'Normandía',
    telefono: '+573163582302',
    lat: 4.67136,
    lng: -74.10541,
    horaApertura: '12:00',
    horaCierre: '22:00',
    tarifaDomicilio: 6000,
    limiteMinutosEntrega: 25,
    minutosPreparacion: 20,
    radioEntregaKm: 4.5,
    qrPagoUrl: '/pagos/qr-ejemplo.svg',
    qrPagoInstrucciones: 'Escanea el código con Nequi o Bancolombia por el valor exacto y muéstrale el comprobante al domiciliario.',
  },
] as const

const INSUMOS = [
  ['pan-brioche', 'Pan brioche', 'und'],
  ['carne', 'Carne de res para hamburguesa', 'g'],
  ['cheddar', 'Queso cheddar (lonja)', 'und'],
  ['tocineta', 'Tocineta', 'g'],
  ['lechuga', 'Lechuga', 'g'],
  ['tomate', 'Tomate', 'g'],
  ['cebolla-caramelizada', 'Cebolla caramelizada', 'g'],
  ['salsa-casa', 'Salsa de la casa', 'ml'],
  ['costeno', 'Queso costeño', 'g'],
  ['maduro', 'Plátano maduro', 'und'],
  ['hogao', 'Hogao', 'ml'],
  ['pan-perro', 'Pan para perro', 'und'],
  ['chorizo', 'Chorizo santarrosano', 'und'],
  ['mozzarella', 'Queso mozzarella', 'g'],
  ['ripio', 'Papa ripio', 'g'],
  ['codorniz', 'Huevo de codorniz', 'und'],
  ['salsa-pina', 'Salsa de piña', 'ml'],
  ['salsa-rosada', 'Salsa rosada', 'ml'],
  ['cebolla-crispy', 'Cebolla crispy', 'g'],
] as const

type ClaveInsumo = (typeof INSUMOS)[number][0]

const PRODUCTOS: {
  slug: string
  categoria: 'hamburguesas' | 'choriperros'
  nombre: string
  descripcion: string
  precios: Record<'villaluz' | 'normandia', number | null>
  receta: [ClaveInsumo, number][]
}[] = [
  {
    slug: 'la-rejana',
    categoria: 'hamburguesas',
    nombre: 'La Rejana',
    descripcion: 'Doble carne a la parrilla (300 g), doble cheddar, tocineta crocante, cebolla caramelizada y salsa de la casa.',
    precios: { villaluz: 32000, normandia: 33000 },
    receta: [['pan-brioche', 1], ['carne', 300], ['cheddar', 2], ['tocineta', 40], ['cebolla-caramelizada', 40], ['salsa-casa', 30]],
  },
  {
    slug: 'la-callejera',
    categoria: 'hamburguesas',
    nombre: 'La Callejera',
    descripcion: 'La clásica de la calle: carne de 150 g, cheddar, lechuga, tomate y salsa de la casa.',
    precios: { villaluz: 22000, normandia: 22000 },
    receta: [['pan-brioche', 1], ['carne', 150], ['cheddar', 1], ['lechuga', 20], ['tomate', 40], ['salsa-casa', 25]],
  },
  {
    slug: 'la-parchada',
    categoria: 'hamburguesas',
    nombre: 'La Parchada',
    descripcion: 'Carne de 150 g, queso costeño a la plancha, maduro, hogao y un toque de salsa de la casa.',
    precios: { villaluz: 26000, normandia: 27000 },
    receta: [['pan-brioche', 1], ['carne', 150], ['costeno', 60], ['maduro', 0.5], ['hogao', 30], ['salsa-casa', 20]],
  },
  {
    slug: 'choriperro-clasico',
    categoria: 'choriperros',
    nombre: 'Choriperro Clásico',
    descripcion: 'Chorizo santarrosano a la brasa en pan de perro, papa ripio, salsa rosada y salsa de piña.',
    precios: { villaluz: 15000, normandia: 15000 },
    receta: [['pan-perro', 1], ['chorizo', 1], ['ripio', 30], ['salsa-rosada', 20], ['salsa-pina', 15]],
  },
  {
    slug: 'choriperro-rejano',
    categoria: 'choriperros',
    nombre: 'Choriperro Rejano',
    descripcion: 'Chorizo a la brasa, mozzarella gratinada, tocineta, cebolla crispy, papa ripio y salsa de la casa.',
    precios: { villaluz: 19000, normandia: 20000 },
    receta: [['pan-perro', 1], ['chorizo', 1], ['mozzarella', 50], ['tocineta', 30], ['cebolla-crispy', 20], ['ripio', 30], ['salsa-casa', 20]],
  },
  {
    slug: 'choriperro-ranchero',
    categoria: 'choriperros',
    nombre: 'Choriperro Ranchero',
    descripcion: 'Chorizo, huevos de codorniz, queso costeño, papa ripio y salsa de piña. Solo en Villaluz.',
    precios: { villaluz: 18000, normandia: null },
    receta: [['pan-perro', 1], ['chorizo', 1], ['codorniz', 3], ['costeno', 40], ['ripio', 30], ['salsa-pina', 20]],
  },
]

// Stock inicial [villaluz, normandia] y mínimo de alerta.
const STOCK: Record<ClaveInsumo, [number, number, number]> = {
  'pan-brioche': [32, 24, 10],
  carne: [9000, 6000, 3000],
  cheddar: [80, 50, 20],
  tocineta: [2000, 1200, 500],
  lechuga: [1500, 1000, 300],
  tomate: [3000, 2000, 600],
  'cebolla-caramelizada': [1500, 900, 300],
  'salsa-casa': [4000, 3000, 800],
  costeno: [2500, 1500, 500],
  maduro: [12, 0, 4],
  hogao: [1500, 900, 300],
  'pan-perro': [40, 30, 10],
  chorizo: [45, 6, 10],
  mozzarella: [2000, 1200, 400],
  ripio: [3000, 2000, 600],
  codorniz: [60, 0, 15],
  'salsa-pina': [2000, 1500, 400],
  'salsa-rosada': [2000, 1500, 400],
  'cebolla-crispy': [800, 500, 200],
}

const NOMBRES = ['María Camila Torres', 'Andrés Felipe Gil', 'Juliana Restrepo', 'Santiago Mejía', 'Valentina Ospina', 'Camilo Rodríguez', 'Laura Sofía Peña', 'Sebastián Castro', 'Daniela Herrera', 'Juan Pablo Rincón', 'Natalia Vargas', 'Mateo Cárdenas', 'Paula Andrea Ruiz', 'Felipe Quintero', 'Manuela Jaramillo']
const VIAS = ['Calle', 'Carrera', 'Transversal', 'Diagonal']

export async function sembrar(
  db: BaseDatos,
  opciones: {
    pimienta: string
    historicoDias?: number
    silencioso?: boolean
    costoHash?: number
    /** Mesas ocupadas en Villaluz para la demo (las pruebas lo desactivan para partir del inventario inicial). */
    cuentasDemo?: boolean
  },
) {
  // La pimienta debe ser la misma TOKENS_PEPPER de la API: con otra, las contraseñas demo no servirían.
  if (opciones.pimienta.length < 32) throw new Error('Define TOKENS_PEPPER (≥ 32 caracteres) antes de sembrar')
  const log = (m: string) => {
    if (!opciones.silencioso) console.log(m)
  }
  const R = rng(20261103)
  const ahora = new Date()
  const hashDemo = await hasherBcrypt(opciones.costoHash ?? 12, opciones.pimienta).hash(CLAVE_DEMO)

  await db.transaction(async (tx) => {
    const repos = crearRepositorios(tx)

    // --- Sedes ---------------------------------------------------------------------------
    const sedes: Record<string, string> = {}
    for (const s of SEDES) {
      const creada = await repos.sedes.crear({ ...s, activa: true })
      sedes[s.slug] = creada.id
    }
    log(`✔ ${SEDES.length} sedes`)

    // --- Catálogo ------------------------------------------------------------------------
    const categorias = {
      hamburguesas: (await repos.catalogo.crearCategoria({ nombre: 'Hamburguesas', slug: 'hamburguesas', orden: 1, activa: true })).id,
      choriperros: (await repos.catalogo.crearCategoria({ nombre: 'Choriperros', slug: 'choriperros', orden: 2, activa: true })).id,
    }
    const insumos = {} as Record<ClaveInsumo, string>
    for (const [clave, nombre, unidad] of INSUMOS) {
      insumos[clave] = (await repos.inventario.crearInsumo({ nombre, unidad, activo: true })).id
    }
    const productos: Record<string, { id: string; nombre: string; precios: Record<string, number | null> }> = {}
    for (const p of PRODUCTOS) {
      const creado = await repos.catalogo.crearProducto({
        categoriaId: categorias[p.categoria],
        nombre: p.nombre,
        slug: p.slug,
        descripcion: p.descripcion,
        imagenUrl: `/productos/${p.slug}.svg`,
        activo: true,
      })
      productos[p.slug] = { id: creado.id, nombre: p.nombre, precios: p.precios }
      await repos.catalogo.reemplazarReceta(
        creado.id,
        p.receta.map(([clave, cantidad]) => ({ insumoId: insumos[clave], cantidad })),
      )
      let orden = 0
      for (const [sedeSlug, precio] of Object.entries(p.precios)) {
        if (precio !== null) await repos.catalogo.guardarEntradaMenu({ sedeId: sedes[sedeSlug]!, productoId: creado.id, precio, disponible: true, orden: orden++ })
      }
    }
    log(`✔ ${PRODUCTOS.length} productos con receta y menú por sede`)

    // --- Inventario ---------------------------------------------------------------------
    for (const [clave, [villaluz, normandia, minimo]] of Object.entries(STOCK) as [ClaveInsumo, [number, number, number]][]) {
      for (const [slug, cantidad] of [['villaluz', villaluz], ['normandia', normandia]] as const) {
        await repos.inventario.fijarMinimo(sedes[slug]!, insumos[clave], minimo)
        if (cantidad > 0) await repos.inventario.mover({ sedeId: sedes[slug]!, insumoId: insumos[clave], delta: cantidad, tipo: 'entrada', nota: 'Inventario inicial' })
      }
    }
    log('✔ Inventario inicial por sede')

    // --- Usuarios de prueba -------------------------------------------------------------
    const usuario = async (email: string, nombre: string, rol: (typeof t.usuarios.$inferInsert)['rol'], sedeSlug: string | null, extra: Partial<typeof t.usuarios.$inferInsert> = {}) => {
      const u = await repos.usuarios.crear({
        email,
        nombre,
        rol: rol!,
        sedeId: sedeSlug ? sedes[sedeSlug]! : null,
        passwordHash: hashDemo,
        emailVerificadoEn: ahora,
        aceptoPrivacidadEn: ahora,
        versionPrivacidad: VERSION_PRIVACIDAD,
      })
      if (Object.keys(extra).length) await tx.update(t.usuarios).set(extra).where(sql`${t.usuarios.id} = ${u.id}`)
      return u.id
    }
    const admin = await usuario('admin@larejana.test', 'Daniel (Admin)', 'admin', null, { telefono: '+573001112233', whatsappHabilitado: true })
    await usuario('cocina.villaluz@larejana.test', 'Carlos Díaz', 'cocina', 'villaluz')
    const cajaVillaluz = await usuario('caja.villaluz@larejana.test', 'Laura Gómez', 'caja', 'villaluz')
    const domi1 = await usuario('domi.villaluz@larejana.test', 'Jhon Fredy Cárdenas', 'domiciliario', 'villaluz', { telefono: '+573008812233' })
    await usuario('domi2.villaluz@larejana.test', 'Brayan Muñoz', 'domiciliario', 'villaluz', { telefono: '+573134409987' })
    const meseroVillaluz = await usuario('mesero.villaluz@larejana.test', 'Valentina Ruiz', 'mesero', 'villaluz')
    await usuario('mesero.normandia@larejana.test', 'Julián Andrés Torres', 'mesero', 'normandia')
    await usuario('cocina.normandia@larejana.test', 'Luisa Fernanda Vélez', 'cocina', 'normandia')
    await usuario('caja.normandia@larejana.test', 'Camilo Rojas', 'caja', 'normandia')
    await usuario('domi.normandia@larejana.test', 'Wilson Patiño', 'domiciliario', 'normandia', { telefono: '+573112234455' })
    const cliente = await usuario('cliente@larejana.test', 'Ana María Cliente', 'cliente', null, { telefono: '+573201234567' })
    await repos.direcciones.crear({ usuarioId: cliente, etiqueta: 'Casa', direccion: 'Calle 68 # 78-15', detalle: 'Apto 302, torre 2', barrio: 'Villaluz', lat: 4.69115, lng: -74.10812 })
    log('✔ Usuarios de prueba (clave: Rejana2026*)')

    // --- Histórico de ventas (para reportes y tablero) ------------------------------------
    const dias = opciones.historicoDias ?? 60
    const pedidosHistoricos: (typeof t.pedidos.$inferInsert)[] = []
    const itemsHistoricos: { indice: number; items: Omit<typeof t.pedidoItems.$inferInsert, 'pedidoId'>[] }[] = []
    for (let d = dias; d >= 1; d--) {
      for (const s of SEDES) {
        const sedeId = sedes[s.slug]!
        const fecha = new Date(ahora.getTime() - d * 86_400_000)
        const diaSemana = new Date(fecha.getTime() - 5 * 3_600_000).getUTCDay()
        const finDeSemana = diaSemana === 5 || diaSemana === 6 || diaSemana === 0
        const base = s.slug === 'villaluz' ? R.int(16, 28) : R.int(9, 18)
        const cantidad = Math.round(base * (finDeSemana ? 1.45 : 1))
        const menu = PRODUCTOS.filter((p) => p.precios[s.slug] !== null)
        for (let i = 0; i < cantidad; i++) {
          // Hora en Bogotá entre 12:00 y 22:00 (UTC−5).
          const minutoDia = R.int(12 * 60, 21 * 60 + 50)
          const diaBog = new Date(fecha.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
          const creadoEn = new Date(`${diaBog}T${String(Math.floor(minutoDia / 60)).padStart(2, '0')}:${String(minutoDia % 60).padStart(2, '0')}:00-05:00`)
          const lineas = Array.from({ length: R.int(1, 3) }, () => R.pick(menu))
          const unicas = [...new Map(lineas.map((p) => [p.slug, p])).values()]
          const items = unicas.map((p) => {
            const cant = R.int(1, 2)
            const precio = p.precios[s.slug]!
            return { productoId: productos[p.slug]!.id, nombre: p.nombre, precioUnitario: precio, cantidad: cant, subtotal: precio * cant, notas: null }
          })
          const subtotal = items.reduce((a, b) => a + b.subtotal, 0)
          const cancelado = R.next() < 0.05
          const entregadoEn = new Date(creadoEn.getTime() + R.int(28, 50) * 60_000)
          pedidosHistoricos.push({
            sedeId,
            clienteId: R.next() < 0.25 ? cliente : null,
            estado: cancelado ? 'cancelado' : 'entregado',
            contactoNombre: R.pick(NOMBRES),
            contactoTelefono: `+57${R.pick(['300', '301', '310', '311', '312', '315', '316', '320'])}${R.int(1000000, 9999999)}`,
            direccion: `${R.pick(VIAS)} ${R.int(50, 80)} # ${R.int(60, 90)}-${R.int(2, 90)}`,
            barrio: s.barrio,
            lat: s.lat + (R.next() - 0.5) * 0.04,
            lng: s.lng + (R.next() - 0.5) * 0.04,
            metodoPago: R.next() < 0.6 ? 'efectivo' : 'qr',
            subtotal,
            costoEnvio: s.tarifaDomicilio,
            total: subtotal + s.tarifaDomicilio,
            estadoPago: cancelado ? 'pendiente' : 'pagado',
            creadoEn,
            actualizadoEn: cancelado ? creadoEn : entregadoEn,
            entregadoEn: cancelado ? null : entregadoEn,
            canceladoEn: cancelado ? new Date(creadoEn.getTime() + 5 * 60_000) : null,
            cerradoEn: cancelado ? null : entregadoEn,
            cerradoPor: cancelado ? null : cajaVillaluz,
            motivoCancelacion: cancelado ? 'El cliente canceló por teléfono' : null,
          })
          itemsHistoricos.push({ indice: pedidosHistoricos.length - 1, items })
        }
      }
    }
    // Inserción por lotes en orden cronológico (el número de pedido crece con la fecha).
    const orden = pedidosHistoricos.map((p, i) => ({ p, i })).sort((a, b) => a.p.creadoEn!.getTime() - b.p.creadoEn!.getTime())
    const LOTE = 400
    for (let i = 0; i < orden.length; i += LOTE) {
      const lote = orden.slice(i, i + LOTE)
      const ids = await tx.insert(t.pedidos).values(lote.map((x) => x.p)).returning({ id: t.pedidos.id })
      const items = lote.flatMap((x, k) => itemsHistoricos[x.i]!.items.map((it) => ({ ...it, pedidoId: ids[k]!.id })))
      await tx.insert(t.pedidoItems).values(items)
      const eventos = lote.flatMap((x, k) => [
        { pedidoId: ids[k]!.id, estado: 'recibido' as const, creadoEn: x.p.creadoEn! },
        { pedidoId: ids[k]!.id, estado: x.p.estado!, creadoEn: x.p.actualizadoEn! },
      ])
      await tx.insert(t.pedidoEventos).values(eventos)
      const pagos = lote
        .map((x, k) => ({ x, id: ids[k]!.id }))
        .filter(({ x }) => x.p.estado === 'entregado')
        .map(({ x, id }) => ({ pedidoId: id, metodo: x.p.metodoPago!, monto: x.p.total!, registradoPor: cajaVillaluz, creadoEn: x.p.entregadoEn! }))
      if (pagos.length) await tx.insert(t.pagos).values(pagos)
    }
    log(`✔ ${pedidosHistoricos.length} pedidos históricos (${dias} días)`)

    // --- Pedidos vivos de hoy en Villaluz (descuentan inventario de verdad) ----------------
    const villaluz = SEDES[0]
    const vivos: { estado: 'recibido' | 'en_preparacion' | 'listo'; minutos: number; productos: [string, number][]; dLat: number; dLng: number; cliente?: boolean }[] = [
      { estado: 'listo', minutos: 26, productos: [['la-rejana', 1], ['choriperro-clasico', 2]], dLat: 0.012, dLng: 0.006 },
      { estado: 'listo', minutos: 22, productos: [['la-callejera', 2]], dLat: 0.004, dLng: -0.011 },
      { estado: 'en_preparacion', minutos: 12, productos: [['choriperro-rejano', 1], ['la-parchada', 1]], dLat: -0.008, dLng: 0.007 },
      { estado: 'recibido', minutos: 4, productos: [['la-rejana', 2]], dLat: 0.006, dLng: 0.012, cliente: true },
      { estado: 'recibido', minutos: 1, productos: [['choriperro-ranchero', 1], ['choriperro-clasico', 1]], dLat: -0.013, dLng: -0.004 },
    ]
    for (const [k, v] of vivos.entries()) {
      const items = v.productos.map(([slug, cant]) => {
        const p = productos[slug]!
        const precio = p.precios.villaluz!
        return { productoId: p.id, nombre: p.nombre, precioUnitario: precio, cantidad: cant, subtotal: precio * cant, notas: null }
      })
      const subtotal = items.reduce((a, b) => a + b.subtotal, 0)
      const creadoEn = new Date(ahora.getTime() - v.minutos * 60_000)
      const [p] = await tx
        .insert(t.pedidos)
        .values({
          sedeId: sedes.villaluz!,
          clienteId: v.cliente ? cliente : null,
          estado: v.estado,
          contactoNombre: v.cliente ? 'Ana María Cliente' : NOMBRES[k]!,
          contactoTelefono: v.cliente ? '+573201234567' : `+57310555${String(1000 + k)}`,
          direccion: `${VIAS[k % 4]} ${66 + k} # ${70 + k * 2}-${10 + k * 7}`,
          direccionDetalle: k % 2 === 0 ? `Apto ${200 + k}` : null,
          barrio: 'Villaluz',
          lat: villaluz.lat + v.dLat,
          lng: villaluz.lng + v.dLng,
          notas: k === 0 ? 'Timbre dañado, llamar al llegar' : null,
          metodoPago: k % 2 === 0 ? 'efectivo' : 'qr',
          pagaCon: k === 0 ? 100000 : null,
          subtotal,
          costoEnvio: villaluz.tarifaDomicilio,
          total: subtotal + villaluz.tarifaDomicilio,
          creadoEn,
          actualizadoEn: creadoEn,
          domiciliarioId: v.estado === 'listo' ? domi1 : null,
        })
        .returning({ id: t.pedidos.id })
      await tx.insert(t.pedidoItems).values(items.map((it) => ({ ...it, pedidoId: p!.id })))
      await tx.insert(t.pedidoEventos).values({ pedidoId: p!.id, estado: 'recibido', creadoEn })
      if (v.estado !== 'recibido') await tx.insert(t.pedidoEventos).values({ pedidoId: p!.id, estado: 'en_preparacion', creadoEn: new Date(creadoEn.getTime() + 3 * 60_000) })
      if (v.estado === 'listo') await tx.insert(t.pedidoEventos).values({ pedidoId: p!.id, estado: 'listo', creadoEn: new Date(creadoEn.getTime() + 18 * 60_000) })
      for (const it of items) {
        const receta = PRODUCTOS.find((x) => productos[x.slug]!.id === it.productoId)!.receta
        for (const [clave, cantidad] of receta) {
          await repos.inventario.mover({ sedeId: sedes.villaluz!, insumoId: insumos[clave], delta: -cantidad * it.cantidad, tipo: 'consumo_pedido', pedidoId: p!.id })
        }
      }
    }
    log(`✔ ${vivos.length} pedidos en curso hoy en Villaluz`)

    // --- Mesas del salón ----------------------------------------------------------------------
    const plano: Record<string, [zona: string, puestos: number[]][]> = {
      villaluz: [
        ['Salón', [4, 4, 4, 2, 2, 6]],
        ['Terraza', [4, 4, 6, 8]],
      ],
      normandia: [
        ['Primer piso', [4, 4, 2, 2, 6]],
        ['Segundo piso', [4, 6, 8]],
      ],
    }
    const mesasPorSede: Record<string, Record<number, string>> = {}
    for (const [slug, zonas] of Object.entries(plano)) {
      let numero = 1
      mesasPorSede[slug] = {}
      for (const [zona, puestos] of zonas) {
        for (const p of puestos) {
          const m = await repos.mesas.crearMesa({ sedeId: sedes[slug]!, numero, zona, puestos: p, activa: true })
          mesasPorSede[slug]![numero++] = m.id
        }
      }
    }
    log('✔ Mesas del salón en las dos sedes')

    // --- Mesas ocupadas en Villaluz (rondas que descuentan inventario de verdad) -------------
    if (opciones.cuentasDemo !== false) {
      const cuentasDemo: { mesa: number; personas: number; minutos: number; pidioCuenta?: number; rondas: { estado: 'entregado' | 'en_preparacion' | 'listo'; minutos: number; productos: [string, number, string?][] }[] }[] = [
        {
          mesa: 2,
          personas: 3,
          minutos: 35,
          rondas: [
            { estado: 'entregado', minutos: 34, productos: [['la-rejana', 1, 'término tres cuartos'], ['la-callejera', 2]] },
            { estado: 'en_preparacion', minutos: 7, productos: [['choriperro-clasico', 2]] },
          ],
        },
        { mesa: 5, personas: 2, minutos: 21, rondas: [{ estado: 'listo', minutos: 20, productos: [['la-parchada', 2, 'sin cebolla']] }] },
        { mesa: 8, personas: 4, minutos: 52, pidioCuenta: 3, rondas: [{ estado: 'entregado', minutos: 50, productos: [['la-rejana', 2], ['choriperro-ranchero', 2]] }] },
      ]
      for (const cd of cuentasDemo) {
        const abiertaEn = new Date(ahora.getTime() - cd.minutos * 60_000)
        const [cuenta] = await tx
          .insert(t.cuentasMesa)
          .values({
            sedeId: sedes.villaluz!,
            mesaId: mesasPorSede.villaluz![cd.mesa]!,
            meseroId: meseroVillaluz,
            comensales: cd.personas,
            abiertaEn,
            actualizadoEn: abiertaEn,
            cuentaPedidaEn: cd.pidioCuenta ? new Date(ahora.getTime() - cd.pidioCuenta * 60_000) : null,
          })
          .returning({ id: t.cuentasMesa.id })
        for (const [k, r] of cd.rondas.entries()) {
          const items = r.productos.map(([slug, cant, nota]) => {
            const p = productos[slug]!
            const precio = p.precios.villaluz!
            return { productoId: p.id, nombre: p.nombre, precioUnitario: precio, cantidad: cant, subtotal: precio * cant, notas: nota ?? null }
          })
          const subtotal = items.reduce((a, b) => a + b.subtotal, 0)
          const creadoEn = new Date(ahora.getTime() - r.minutos * 60_000)
          const [p] = await tx
            .insert(t.pedidos)
            .values({ canal: 'mesa', sedeId: sedes.villaluz!, cuentaId: cuenta!.id, ronda: k + 1, estado: r.estado, subtotal, costoEnvio: 0, total: subtotal, creadoEn, actualizadoEn: creadoEn, entregadoEn: r.estado === 'entregado' ? new Date(creadoEn.getTime() + 16 * 60_000) : null })
            .returning({ id: t.pedidos.id })
          await tx.insert(t.pedidoItems).values(items.map((it) => ({ ...it, pedidoId: p!.id })))
          await tx.insert(t.pedidoEventos).values({ pedidoId: p!.id, estado: 'recibido', actorId: meseroVillaluz, actorRol: 'mesero', creadoEn })
          await tx.insert(t.pedidoEventos).values({ pedidoId: p!.id, estado: 'en_preparacion', creadoEn: new Date(creadoEn.getTime() + 2 * 60_000) })
          if (r.estado !== 'en_preparacion') await tx.insert(t.pedidoEventos).values({ pedidoId: p!.id, estado: 'listo', creadoEn: new Date(creadoEn.getTime() + 12 * 60_000) })
          if (r.estado === 'entregado') await tx.insert(t.pedidoEventos).values({ pedidoId: p!.id, estado: 'entregado', actorId: meseroVillaluz, actorRol: 'mesero', creadoEn: new Date(creadoEn.getTime() + 16 * 60_000) })
          for (const it of items) {
            const receta = PRODUCTOS.find((x) => productos[x.slug]!.id === it.productoId)!.receta
            for (const [clave, cantidad] of receta) {
              await repos.inventario.mover({ sedeId: sedes.villaluz!, insumoId: insumos[clave], delta: -cantidad * it.cantidad, tipo: 'consumo_pedido', pedidoId: p!.id })
            }
          }
        }
      }
      log(`✔ ${cuentasDemo.length} mesas ocupadas en Villaluz`)
    }

    await repos.auditoria.registrar({ actorId: admin, actorRol: 'admin', accion: 'seed', entidad: 'sistema', entidadId: null, datos: { nota: 'Datos de prueba cargados' } })
  })
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (esPrincipal) {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_PERMITIR_PRODUCCION !== 'true') {
    console.error('✖ El seed crea usuarios con contraseña conocida: no se ejecuta en producción.')
    process.exit(1)
  }
  const conexion = conectarBD(process.env.DATABASE_URL!, { ssl: process.env.DATABASE_SSL === 'true', max: 2 })
  const [{ n }] = (await conexion.db.execute<{ n: number }>(sql`select count(*)::int as n from sedes`)).rows as [{ n: number }]
  if (n > 0) {
    console.log('La base ya tiene datos; usa `pnpm db:reset` para empezar de cero.')
  } else {
    await sembrar(conexion.db, { pimienta: process.env.TOKENS_PEPPER ?? '' }) // falla si falta
    console.log('✔ Seed completo')
  }
  await conexion.cerrar()
}

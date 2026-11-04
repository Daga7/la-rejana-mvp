'use client'

import { cop, NOMBRE_UNIDAD, type Unidad } from '@rejana/shared'
import { ChefHat, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'

interface Linea {
  insumoId: string
  insumoNombre: string
  unidad: Unidad
  cantidad: number
}
interface ProductoAdmin {
  id: string
  categoriaId: string
  nombre: string
  slug: string
  descripcion: string
  imagenUrl: string | null
  activo: boolean
  receta: Linea[]
  menu: { sedeId: string; precio: number; disponible: boolean; orden: number }[]
}
interface Catalogo {
  categorias: { id: string; nombre: string; slug: string; orden: number; activa: boolean }[]
  insumos: { id: string; nombre: string; unidad: Unidad; activo: boolean }[]
  sedes: { id: string; nombre: string; activa: boolean }[]
  productos: ProductoAdmin[]
}

async function ejecutar(texto: string, fn: () => Promise<unknown>, despues: () => void) {
  try {
    await fn()
    avisar(texto)
    despues()
  } catch (e) {
    avisar(e instanceof ErrorApi ? e.message : 'No se pudo guardar', 'error')
  }
}

export function MenuAdmin() {
  const { data, mutate } = useSWR<Catalogo>('/admin/catalogo', obtener)
  const [receta, setReceta] = useState<ProductoAdmin | null>(null)
  const [editar, setEditar] = useState<ProductoAdmin | 'nuevo' | null>(null)
  const [categoria, setCategoria] = useState(false)
  if (!data) return <div className="esqueleto h-96" />
  const recargar = () => void mutate()

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="acento text-lg">Precios y disponibilidad por sede</p>
          <h1 className="titulo text-3xl">Menú y recetas</h1>
        </div>
        <button className="btn btn-blanco btn-sm" onClick={() => setCategoria(true)}>
          <Plus size={16} aria-hidden /> Categoría
        </button>
        <button className="btn btn-amarillo btn-sm" onClick={() => setEditar('nuevo')}>
          <Plus size={16} aria-hidden /> Producto
        </button>
      </div>
      {data.categorias.map((c) => {
        const productos = data.productos.filter((p) => p.categoriaId === c.id)
        return (
          <section key={c.id} aria-labelledby={`cat-${c.id}`}>
            <h2 id={`cat-${c.id}`} className="titulo mb-3 text-2xl">
              {c.nombre} {!c.activa && <span className="chip bg-white/10 text-sm normal-case text-noche-300">oculta</span>}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {productos.map((p) => (
                <article key={p.id} className="sticker p-4 text-tinta">
                  <div className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imagenUrl ?? '/iconos/icono.svg'} alt="" width={96} height={72} className="h-18 w-24 shrink-0 rounded-xl border-2 border-tinta object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold">
                        {p.nombre} {!p.activo && <span className="chip bg-rojo-100 text-rojo-600">inactivo</span>}
                      </p>
                      <p className="line-clamp-2 text-xs text-tinta-soft">{p.descripcion}</p>
                      <p className="mt-1 text-xs text-tinta-soft">{p.receta.length ? `Receta: ${p.receta.length} insumos` : 'Sin receta (no se descuenta inventario)'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button className="btn btn-blanco btn-sm !min-h-8 !px-2.5" onClick={() => setEditar(p)} aria-label={`Editar ${p.nombre}`}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn btn-turquesa btn-sm !min-h-8 !px-2.5" onClick={() => setReceta(p)} aria-label={`Receta de ${p.nombre}`}>
                        <ChefHat size={15} />
                      </button>
                    </div>
                  </div>
                  <table className="tabla mt-3">
                    <thead>
                      <tr>
                        <th>Sede</th>
                        <th>En menú</th>
                        <th className="num">Precio</th>
                        <th>Disponible</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sedes.map((s) => (
                        <FilaSede key={s.id} producto={p} sede={s} onCambio={recargar} />
                      ))}
                    </tbody>
                  </table>
                </article>
              ))}
              {productos.length === 0 && <p className="text-sm text-noche-300">Sin productos en esta categoría.</p>}
            </div>
          </section>
        )
      })}

      <Hoja abierta={!!receta} onCerrar={() => setReceta(null)} titulo={`Receta · ${receta?.nombre ?? ''}`} ancho="max-w-xl">
        {receta && <EditorReceta producto={receta} insumos={data.insumos} onListo={() => (setReceta(null), recargar())} />}
      </Hoja>
      <Hoja abierta={!!editar} onCerrar={() => setEditar(null)} titulo={editar === 'nuevo' ? 'Nuevo producto' : `Editar ${editar?.nombre ?? ''}`}>
        {editar && <FormProducto producto={editar === 'nuevo' ? null : editar} categorias={data.categorias} onListo={() => (setEditar(null), recargar())} />}
      </Hoja>
      <Hoja abierta={categoria} onCerrar={() => setCategoria(false)} titulo="Nueva categoría">
        <FormCategoria orden={data.categorias.length + 1} onListo={() => (setCategoria(false), recargar())} />
      </Hoja>
    </div>
  )
}

function FilaSede({ producto, sede, onCambio }: { producto: ProductoAdmin; sede: { id: string; nombre: string }; onCambio: () => void }) {
  const entrada = producto.menu.find((m) => m.sedeId === sede.id)
  const [precio, setPrecio] = useState(String(entrada?.precio ?? ''))
  const guardar = (datos: { precio: number; disponible: boolean }) =>
    ejecutar(`${producto.nombre} · ${sede.nombre}: guardado`, () => api(`/admin/menu/${sede.id}/${producto.id}`, { metodo: 'PUT', cuerpo: { ...datos, orden: entrada?.orden ?? 0 } }), onCambio)
  return (
    <tr>
      <td className="font-semibold">{sede.nombre}</td>
      <td>
        <input
          type="checkbox"
          className="h-5 w-5 accent-rosa"
          aria-label={`${producto.nombre} en el menú de ${sede.nombre}`}
          checked={!!entrada}
          onChange={(e) => {
            if (e.target.checked) {
              const p = Number(precio) || producto.menu[0]?.precio || 0
              if (!p) return avisar('Escribe el precio primero', 'info')
              void guardar({ precio: p, disponible: true })
            } else void ejecutar(`${producto.nombre} quitado de ${sede.nombre}`, () => api(`/admin/menu/${sede.id}/${producto.id}`, { metodo: 'DELETE' }), onCambio)
          }}
        />
      </td>
      <td className="num">
        <input
          className="campo !min-h-9 !w-28 !px-2 !py-1 text-right text-sm"
          inputMode="numeric"
          aria-label={`Precio en ${sede.nombre}`}
          value={precio}
          placeholder="$"
          onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ''))}
          onBlur={() => {
            const p = Number(precio)
            if (entrada && p > 0 && p !== entrada.precio) void guardar({ precio: p, disponible: entrada.disponible })
          }}
        />
        {entrada && <span className="sr-only">{cop(entrada.precio)}</span>}
      </td>
      <td>
        {entrada ? (
          <button className={`chip border-2 border-tinta !px-3 !py-1 ${entrada.disponible ? 'bg-turquesa' : 'bg-rojo-100 text-rojo-600'}`} onClick={() => void guardar({ precio: entrada.precio, disponible: !entrada.disponible })} aria-pressed={entrada.disponible}>
            {entrada.disponible ? 'Sí' : 'Apagado'}
          </button>
        ) : (
          <span className="text-xs text-tinta-soft">—</span>
        )}
      </td>
    </tr>
  )
}

function EditorReceta({ producto, insumos, onListo }: { producto: ProductoAdmin; insumos: Catalogo['insumos']; onListo: () => void }) {
  const [lineas, setLineas] = useState(producto.receta.map((l) => ({ insumoId: l.insumoId, cantidad: String(l.cantidad) })))
  const [enviando, setEnviando] = useState(false)
  const unidad = (id: string) => insumos.find((i) => i.id === id)?.unidad ?? 'und'
  const libres = insumos.filter((i) => i.activo && !lineas.some((l) => l.insumoId === i.id))
  return (
    <div className="grid gap-4">
      <p className="text-sm text-tinta-soft">Cantidad de cada insumo para preparar UNA unidad. Al confirmar un pedido se descuenta del inventario de la sede.</p>
      <ul className="grid gap-2">
        {lineas.map((l, i) => (
          <li key={l.insumoId} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{insumos.find((x) => x.id === l.insumoId)?.nombre}</span>
            <input
              className="campo !min-h-9 !w-24 !px-2 !py-1 text-right"
              inputMode="decimal"
              aria-label="Cantidad"
              value={l.cantidad}
              onChange={(e) => setLineas((ls) => ls.map((x, k) => (k === i ? { ...x, cantidad: e.target.value } : x)))}
            />
            <span className="w-8 text-xs text-tinta-soft">{unidad(l.insumoId)}</span>
            <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5" onClick={() => setLineas((ls) => ls.filter((_, k) => k !== i))} aria-label="Quitar insumo">
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      {libres.length > 0 && (
        <select className="campo" value="" onChange={(e) => e.target.value && setLineas((ls) => [...ls, { insumoId: e.target.value, cantidad: '' }])} aria-label="Agregar insumo">
          <option value="">+ Agregar insumo…</option>
          {libres.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre} ({NOMBRE_UNIDAD[i.unidad]})
            </option>
          ))}
        </select>
      )}
      <button
        className="btn btn-rosa btn-lg"
        disabled={enviando}
        onClick={async () => {
          const items = lineas.map((l) => ({ insumoId: l.insumoId, cantidad: Number(l.cantidad.replace(',', '.')) }))
          if (items.some((x) => !(x.cantidad > 0))) return avisar('Todas las cantidades deben ser mayores que cero', 'error')
          setEnviando(true)
          await ejecutar('Receta guardada', () => api(`/admin/productos/${producto.id}/receta`, { metodo: 'PUT', cuerpo: { items } }), onListo)
          setEnviando(false)
        }}
      >
        Guardar receta
      </button>
    </div>
  )
}

function FormProducto({ producto, categorias, onListo }: { producto: ProductoAdmin | null; categorias: Catalogo['categorias']; onListo: () => void }) {
  const [datos, setDatos] = useState({
    categoriaId: producto?.categoriaId ?? categorias[0]?.id ?? '',
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    imagenUrl: producto?.imagenUrl ?? '',
    activo: producto?.activo ?? true,
  })
  const [enviando, setEnviando] = useState(false)
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setEnviando(true)
        const cuerpo = { ...datos, imagenUrl: datos.imagenUrl || null }
        await ejecutar(producto ? 'Producto actualizado' : 'Producto creado: ahora agrégalo al menú de cada sede', () => api(producto ? `/admin/productos/${producto.id}` : '/admin/productos', { metodo: producto ? 'PUT' : 'POST', cuerpo }), onListo)
        setEnviando(false)
      }}
    >
      <label className="grid gap-1">
        <span className="etiqueta">Categoría</span>
        <select className="campo" value={datos.categoriaId} onChange={(e) => setDatos({ ...datos, categoriaId: e.target.value })}>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="etiqueta">Nombre</span>
        <input className="campo" required minLength={2} maxLength={60} value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
      </label>
      <label className="grid gap-1">
        <span className="etiqueta">Descripción</span>
        <textarea className="campo min-h-20" maxLength={300} value={datos.descripcion} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} />
      </label>
      <label className="grid gap-1">
        <span className="etiqueta">Foto (URL https o ruta /productos/…)</span>
        <input className="campo" maxLength={500} value={datos.imagenUrl} onChange={(e) => setDatos({ ...datos, imagenUrl: e.target.value })} placeholder="https://…/foto.webp" />
      </label>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-rosa" checked={datos.activo} onChange={(e) => setDatos({ ...datos, activo: e.target.checked })} /> Producto activo
      </label>
      <button className="btn btn-rosa btn-lg" disabled={enviando}>
        {producto ? 'Guardar cambios' : 'Crear producto'}
      </button>
    </form>
  )
}

function FormCategoria({ orden, onListo }: { orden: number; onListo: () => void }) {
  const [nombre, setNombre] = useState('')
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        await ejecutar('Categoría creada', () => api('/admin/categorias', { metodo: 'POST', cuerpo: { nombre, orden, activa: true } }), onListo)
      }}
    >
      <label className="grid gap-1">
        <span className="etiqueta">Nombre</span>
        <input className="campo" required minLength={2} maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Bebidas" />
      </label>
      <button className="btn btn-rosa btn-lg">Crear categoría</button>
    </form>
  )
}

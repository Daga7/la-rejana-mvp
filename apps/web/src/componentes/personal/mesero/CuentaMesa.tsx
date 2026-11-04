'use client'

import { cop, hora, minutosDesde, type CuentaMesaDTO, type MenuDTO, type MesaSalonDTO, type PedidoDTO, type PedidoMesaDTO, type ProductoMenuDTO, type SalonDTO } from '@rejana/shared'
import { ArrowLeft, ArrowRightLeft, Check, Combine, MessageSquarePlus, ReceiptText, Send, Split, Trash2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { avisar } from '@/componentes/Avisos'
import { Hoja } from '@/componentes/Hoja'
import { api, ErrorApi, obtener } from '@/lib/api'
import { useTiempoReal } from '@/lib/tiempo-real'
import { useTic } from '../comunes'
import { itemsParaEnviar, useBorradores, type LineaBorrador } from './borradores'
import { ChipRonda } from './comunes'
import { Contador } from './Salon'

const SIN_BORRADOR: LineaBorrador[] = []

export function CuentaMesa({ id }: { id: string }) {
  const router = useRouter()
  const { data, error, mutate } = useSWR<{ cuenta: CuentaMesaDTO }>(`/cuentas/${id}`, obtener)
  const cuenta = data?.cuenta
  // El salón guarda su caché: al volver debe mostrar ya la mesa liberada, trasladada o juntada.
  const { mutate: mutarGlobal } = useSWRConfig()
  const refrescarSalon = () => (cuenta ? mutarGlobal(`/mesas/${cuenta.sedeId}/salon`) : Promise.resolve())
  const { data: menu } = useSWR<MenuDTO>(cuenta ? `/sedes/${cuenta.sedeId}/menu` : null, obtener, { refreshInterval: 60_000 })
  const lineas = useBorradores((s) => s.porCuenta[id]?.lineas ?? SIN_BORRADOR)
  const clave = useBorradores((s) => s.porCuenta[id]?.clave)
  const { agregar, cambiar, quitar, limpiar } = useBorradores()
  const [vista, setVista] = useState<'menu' | 'cuenta'>('menu')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  useTic()

  useTiempoReal(
    { activo: !!cuenta },
    {
      'pedido:actualizado': (p: PedidoDTO) => {
        if (p.canal === 'mesa' && p.mesa.cuentaId === id) void mutate()
      },
      'cuenta:actualizada': (c: { cuentaId: string }) => {
        if (c.cuentaId === id) void mutate()
      },
    },
  )

  async function accion(nombre: string, fn: () => Promise<unknown>, exito?: string) {
    setOcupado(nombre)
    try {
      await fn()
      if (exito) avisar(exito)
      await Promise.all([mutate(), refrescarSalon()])
      return true
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo completar la acción', 'error')
      return false
    } finally {
      setOcupado(null)
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="text-lg font-bold">No encontramos esa cuenta.</p>
        <Link href="/mesero" className="btn btn-amarillo mt-5">
          Volver al salón
        </Link>
      </div>
    )
  }
  if (!cuenta) {
    return (
      <div className="grid gap-4">
        <div className="esqueleto h-12 w-64" />
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <div className="esqueleto h-96" />
          <div className="esqueleto h-96" />
        </div>
      </div>
    )
  }

  const abierta = cuenta.estado === 'abierta'
  const totalBorrador = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0)
  const unidadesBorrador = lineas.reduce((s, l) => s + l.cantidad, 0)
  const activas = cuenta.rondas.filter((r) => r.estado !== 'cancelado')

  async function enviar() {
    const ok = await accion(
      'enviar',
      () => api(`/cuentas/${id}/rondas`, { metodo: 'POST', cuerpo: { items: itemsParaEnviar(lineas) }, cabeceras: clave ? { 'idempotency-key': clave } : {} }),
      `Ronda de la mesa ${cuenta!.mesaNumero} enviada a la cocina 🔥`,
    )
    if (ok) {
      limpiar(id)
      setVista('cuenta')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/mesero" className="btn btn-noche btn-sm !px-3" aria-label="Volver al salón">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <div className="mr-auto min-w-0">
          <h1 className="titulo text-3xl">
            Mesa {cuenta.mesaNumero}
            {cuenta.mesasUnidas.length > 0 && <span className="text-xl"> + {cuenta.mesasUnidas.map((m) => m.numero).join(', ')}</span>}
          </h1>
          <p className="text-xs text-noche-300">
            {cuenta.zona ? `${cuenta.zona} · ` : ''}
            {cuenta.meseroNombre ? `Atiende ${cuenta.meseroNombre} · ` : ''}abierta a las {hora(cuenta.abiertaEn)} ({minutosDesde(cuenta.abiertaEn)} min)
          </p>
        </div>
        {abierta && (
          <button className="btn btn-blanco btn-sm" onClick={() => setMoviendo(true)} aria-haspopup="dialog">
            <ArrowRightLeft size={16} aria-hidden /> Mover o juntar
          </button>
        )}
        {abierta && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-noche-300">Personas</span>
            <Contador oscuro valor={cuenta.comensales} min={1} max={30} etiqueta="Personas en la mesa" onCambio={(n) => void accion('personas', () => api(`/cuentas/${id}`, { metodo: 'PATCH', cuerpo: { comensales: n } }))} />
          </div>
        )}
      </div>

      {cuenta.estado === 'unida' && cuenta.unidaA ? (
        <div className="sticker mx-auto grid max-w-md gap-3 p-6 text-center text-tinta">
          <p className="text-lg font-black">Esta cuenta se juntó con la de otra mesa</p>
          <p className="text-sm text-tinta-soft">Sus rondas y personas pasaron a la cuenta del grupo; allá se sigue pidiendo y se cobra todo junto.</p>
          <Link href={`/mesero/cuenta/${cuenta.unidaA}`} className="btn btn-rosa">
            Ir a la cuenta del grupo
          </Link>
        </div>
      ) : !abierta ? (
        <div className="sticker mx-auto grid max-w-md gap-3 p-6 text-center text-tinta">
          <p className="text-lg font-black">{cuenta.estado === 'cerrada' ? `Cuenta cobrada: ${cop(cuenta.subtotal + cuenta.propina)}` : 'La mesa se liberó sin consumo'}</p>
          <p className="text-sm text-tinta-soft">La mesa {cuenta.mesaNumero} ya está libre para nuevos clientes.</p>
          <Link href="/mesero" className="btn btn-rosa">
            Volver al salón
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:hidden" role="tablist" aria-label="Vista">
            {(['menu', 'cuenta'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className={`btn btn-sm ${vista === v ? 'btn-amarillo' : 'btn-noche'}`}>
                {v === 'menu' ? (
                  'Menú'
                ) : (
                  <>
                    Cuenta
                    {unidadesBorrador > 0 && (
                      <span key={unidadesBorrador} className="anim-rebote rounded-full bg-rosa-500 px-2 text-white tabular-nums">
                        {unidadesBorrador} por enviar
                      </span>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[1fr_400px]">
            <section className={`${vista === 'menu' ? 'grid' : 'hidden'} gap-4 lg:grid`} aria-label="Menú">
              {!menu ? (
                <div className="esqueleto h-96" />
              ) : (
                <MenuMesero
                  menu={menu}
                  // Sin aviso por producto: el contador del borrador (que rebota) ya lo confirma sin tapar la pantalla.
                  onAgregar={(p) => agregar(id, { productoId: p.id, nombre: p.nombre, precio: p.precio })}
                />
              )}
            </section>

            <section className={`${vista === 'cuenta' ? 'grid' : 'hidden'} gap-4 lg:grid`} aria-label="Cuenta de la mesa">
              {lineas.length > 0 && (
                <div className="rounded-3xl border-2 border-tinta bg-amarillo-100 p-4 text-tinta shadow-sticker">
                  <div className="mb-1 flex items-center justify-between">
                    <h2 className="font-black uppercase">Por enviar</h2>
                    <span className="text-sm font-bold tabular-nums">{cop(totalBorrador)}</span>
                  </div>
                  <ul className="divide-y divide-crema-300">
                    {lineas.map((l, i) => (
                      <LineaPorEnviar key={`${l.productoId}-${i}`} linea={l} onCantidad={(n) => cambiar(id, i, { cantidad: n })} onNota={(t) => cambiar(id, i, { notas: t })} onQuitar={() => quitar(id, i)} />
                    ))}
                  </ul>
                  <button className="btn btn-rosa btn-lg mt-3 w-full" disabled={ocupado === 'enviar'} onClick={() => void enviar()}>
                    <Send size={18} aria-hidden /> Enviar a la cocina ({unidadesBorrador})
                  </button>
                </div>
              )}

              <div className="sticker p-4 text-tinta">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className="font-black uppercase">Cuenta de la mesa</h2>
                  <span className="text-xs text-tinta-soft">
                    {activas.length} {activas.length === 1 ? 'ronda' : 'rondas'}
                  </span>
                </div>
                {cuenta.rondas.length === 0 && <p className="py-3 text-sm text-tinta-soft">Aún no se ha enviado nada a la cocina.</p>}
                {cuenta.rondas.map((r) => (
                  <Ronda
                    key={r.id}
                    ronda={r}
                    ocupado={ocupado === r.id}
                    onServir={() => void accion(r.id, () => api(`/pedidos/${r.id}/estado`, { metodo: 'PATCH', cuerpo: { estado: 'entregado' } }), 'Marcado como servido')}
                    onCancelar={() => {
                      if (!window.confirm(`¿Cancelar la ronda ${r.mesa.ronda}? Los insumos vuelven al inventario.`)) return
                      void accion(r.id, () => api(`/pedidos/${r.id}/cancelar`, { metodo: 'POST', cuerpo: { motivo: 'Corrección del mesero' } }), 'Ronda cancelada')
                    }}
                  />
                ))}
                <div className="mt-2 flex justify-between border-t-2 border-tinta pt-2 text-lg font-black">
                  <span>Total</span>
                  <span className="tabular-nums">{cop(cuenta.subtotal)}</span>
                </div>

                {cuenta.cuentaPedidaEn ? (
                  <div className="mt-3 rounded-2xl border-2 border-tinta bg-rosa-500 p-3 text-sm font-bold text-white">
                    <p className="flex items-center gap-2">
                      <ReceiptText size={18} aria-hidden /> Cuenta solicitada a las {hora(cuenta.cuentaPedidaEn)}: la caja ya ve esta mesa por cobrar.
                    </p>
                    <button className="mt-2 text-xs underline underline-offset-2" onClick={() => void accion('cuenta', () => api(`/cuentas/${id}`, { metodo: 'PATCH', cuerpo: { cuentaPedida: false } }), 'La mesa sigue pidiendo')}>
                      Siguen pidiendo: cancelar la solicitud
                    </button>
                  </div>
                ) : activas.length === 0 && lineas.length === 0 ? (
                  <button
                    className="btn btn-blanco mt-3 w-full"
                    disabled={ocupado === 'liberar'}
                    onClick={async () => {
                      if (await accion('liberar', () => api(`/cuentas/${id}/liberar`, { metodo: 'POST' }), `Mesa ${cuenta.mesaNumero} liberada`)) router.push('/mesero')
                    }}
                  >
                    Liberar la mesa
                  </button>
                ) : (
                  <button className="btn btn-noche mt-3 w-full" disabled={activas.length === 0 || ocupado === 'cuenta'} onClick={() => void accion('cuenta', () => api(`/cuentas/${id}`, { metodo: 'PATCH', cuerpo: { cuentaPedida: true } }), `Mesa ${cuenta.mesaNumero}: cuenta enviada a la caja`)}>
                    <ReceiptText size={18} aria-hidden /> Pedir la cuenta
                  </button>
                )}
              </div>
            </section>
          </div>

          <Hoja abierta={moviendo} onCerrar={() => setMoviendo(false)} titulo={`Mover o juntar la mesa ${cuenta.mesaNumero}`} ancho="max-w-lg">
            {moviendo && (
              <MoverMesa
                cuenta={cuenta}
                onHecho={async (texto) => {
                  setMoviendo(false)
                  avisar(texto)
                  await Promise.all([mutate(), refrescarSalon()])
                }}
              />
            )}
          </Hoja>

          {lineas.length > 0 && vista === 'menu' && (
            <button className="btn btn-rosa btn-lg aparecer fixed inset-x-4 bottom-4 z-20 justify-between lg:hidden" onClick={() => setVista('cuenta')}>
              <span>
                Revisar y enviar{' '}
                <span key={unidadesBorrador} className="anim-rebote inline-block tabular-nums">
                  ({unidadesBorrador})
                </span>
              </span>
              <span className="tabular-nums">{cop(totalBorrador)}</span>
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** Menú para tomar el pedido: categorías y productos grandes para el dedo, con lo agotado deshabilitado. */
function MenuMesero({ menu, onAgregar }: { menu: MenuDTO; onAgregar: (p: ProductoMenuDTO) => void }) {
  const [categoria, setCategoria] = useState(menu.categorias[0]?.id ?? '')
  const actual = menu.categorias.find((c) => c.id === categoria) ?? menu.categorias[0]
  return (
    <div className="grid gap-3">
      <div className="sin-scroll flex gap-2 overflow-x-auto" role="tablist" aria-label="Categorías">
        {menu.categorias.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === actual?.id} onClick={() => setCategoria(c.id)} className={`btn btn-sm shrink-0 ${c.id === actual?.id ? 'btn-amarillo' : 'btn-blanco'}`}>
            {c.nombre}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {actual?.productos.map((p) => (
          <button
            key={p.id}
            disabled={p.agotado}
            onClick={() => onAgregar(p)}
            className="sticker grid min-h-24 content-between gap-1 p-3 text-left text-tinta transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
          >
            <span className="font-extrabold leading-tight">{p.nombre}</span>
            <span className="flex items-end justify-between gap-1">
              <span className="font-black tabular-nums text-rosa-600">{p.agotado ? 'Agotado' : cop(p.precio)}</span>
              {!p.agotado && p.maxUnidades !== null && p.maxUnidades <= 5 && <span className="text-[11px] font-bold text-naranja-700">Quedan {p.maxUnidades}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function LineaPorEnviar({ linea, onCantidad, onNota, onQuitar }: { linea: LineaBorrador; onCantidad: (n: number) => void; onNota: (t: string) => void; onQuitar: () => void }) {
  const [conNota, setConNota] = useState(!!linea.notas)
  return (
    <li className="grid gap-2 py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <b className="block leading-tight">{linea.nombre}</b>
          <span className="text-xs text-tinta-soft tabular-nums">{cop(linea.precio * linea.cantidad)}</span>
        </span>
        <Contador valor={linea.cantidad} min={1} max={20} onCambio={onCantidad} etiqueta={`Cantidad de ${linea.nombre}`} />
        <button className="grid h-10 w-10 place-items-center rounded-full text-tinta-soft hover:bg-black/5" onClick={onQuitar} aria-label={`Quitar ${linea.nombre}`}>
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
      {conNota ? (
        <input className="campo !min-h-10 !py-2 text-sm" maxLength={140} value={linea.notas} onChange={(e) => onNota(e.target.value)} placeholder="Ej.: sin cebolla, término medio" aria-label={`Nota para ${linea.nombre}`} autoFocus />
      ) : (
        <button className="flex w-fit items-center gap-1.5 text-xs font-bold text-rosa-600" onClick={() => setConNota(true)}>
          <MessageSquarePlus size={14} aria-hidden /> Agregar nota para la cocina
        </button>
      )}
    </li>
  )
}

function Ronda({ ronda, ocupado, onServir, onCancelar }: { ronda: PedidoMesaDTO; ocupado: boolean; onServir: () => void; onCancelar: () => void }) {
  const cancelada = ronda.estado === 'cancelado'
  return (
    <div className="border-t-2 border-dashed border-crema-300 py-2 first:border-0">
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs font-bold uppercase text-tinta-soft">
          Ronda {ronda.mesa.ronda} · {hora(ronda.creadoEn)}
        </span>
        <ChipRonda estado={ronda.estado} />
      </div>
      <ul className={`mt-1 grid gap-0.5 text-sm ${cancelada ? 'text-tinta-soft line-through' : ''}`}>
        {ronda.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <span>
              {i.cantidad}× {i.nombre}
              {i.notas && <span className="block text-xs italic text-rosa-600">«{i.notas}»</span>}
            </span>
            <span className="tabular-nums">{cop(i.subtotal)}</span>
          </li>
        ))}
      </ul>
      {ronda.estado === 'listo' && (
        <button className="btn btn-turquesa btn-sm mt-2 w-full" disabled={ocupado} onClick={onServir}>
          <Check size={16} strokeWidth={3} aria-hidden /> Ya lo serví
        </button>
      )}
      {ronda.estado === 'recibido' && (
        <button className="mt-1 flex items-center gap-1 text-xs font-bold text-rojo-600" disabled={ocupado} onClick={onCancelar}>
          <XCircle size={14} aria-hidden /> Cancelar ronda (la cocina aún no la empieza)
        </button>
      )}
    </div>
  )
}

/** Trasladar la cuenta a una mesa libre, juntarle otra mesa (o la cuenta de otra mesa) o separar una juntada. */
function MoverMesa({ cuenta, onHecho }: { cuenta: CuentaMesaDTO; onHecho: (texto: string) => void }) {
  const { data } = useSWR<{ salon: SalonDTO }>(`/mesas/${cuenta.sedeId}/salon`, obtener)
  const [enviando, setEnviando] = useState(false)
  const mesas = data?.salon.mesas ?? []
  const propias = new Set([cuenta.mesaId, ...cuenta.mesasUnidas.map((m) => m.id)])
  const libres = mesas.filter((m) => !m.cuenta && !propias.has(m.id))
  const otras = mesas.filter((m) => !propias.has(m.id) && m.unidaA === null)

  async function hacer(accion: 'trasladar' | 'juntar' | 'separar', m: MesaSalonDTO | { id: string; numero: number }, texto: string) {
    setEnviando(true)
    try {
      await api(`/cuentas/${cuenta.id}/${accion}`, { metodo: 'POST', cuerpo: { mesaId: m.id } })
      onHecho(texto)
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo mover la mesa', 'error')
    } finally {
      setEnviando(false)
    }
  }

  if (!data) return <div className="esqueleto h-48" />
  const boton = 'grid min-h-14 place-items-center rounded-xl border-2 border-tinta px-2 py-1 text-center font-black disabled:opacity-50'
  return (
    <div className="grid gap-5">
      <section className="grid gap-2" aria-labelledby="t-trasladar">
        <h3 id="t-trasladar" className="flex items-center gap-2 font-black">
          <ArrowRightLeft size={18} aria-hidden /> Trasladar a una mesa libre
        </h3>
        <p className="text-xs text-tinta-soft">La cuenta, sus rondas y lo que está en la cocina se van con ella.</p>
        {libres.length === 0 ? (
          <p className="text-sm text-tinta-soft">No hay mesas libres.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
            {libres.map((m) => (
              <button key={m.id} className={`${boton} bg-white`} disabled={enviando} onClick={() => void hacer('trasladar', m, `La cuenta pasó a la mesa ${m.numero}`)}>
                <span>
                  <span className="sr-only">Trasladar a la mesa </span>
                  {m.numero}
                </span>
                <span className="text-[10px] font-bold text-tinta-soft">{m.zona ?? ''}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-2" aria-labelledby="t-juntar">
        <h3 id="t-juntar" className="flex items-center gap-2 font-black">
          <Combine size={18} aria-hidden /> Juntar con otra mesa
        </h3>
        <p className="text-xs text-tinta-soft">Una mesa libre queda ocupada por este grupo. Si la otra mesa tiene cuenta, sus rondas y personas se suman a esta y se cobra todo junto.</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
          {otras.map((m) => (
            <button
              key={m.id}
              className={`${boton} ${m.cuenta ? 'bg-turquesa' : 'bg-white'}`}
              disabled={enviando}
              onClick={() => {
                if (m.cuenta && !window.confirm(`La cuenta de la mesa ${m.numero} (${cop(m.cuenta.subtotal)}) se sumará a esta. ¿Juntarlas?`)) return
                void hacer('juntar', m, m.cuenta ? `La cuenta de la mesa ${m.numero} se juntó con esta` : `La mesa ${m.numero} quedó junta con esta`)
              }}
            >
              <span>
                <span className="sr-only">Juntar la mesa </span>
                {m.numero}
              </span>
              <span className="text-[10px] font-bold">{m.cuenta ? cop(m.cuenta.subtotal) : 'Libre'}</span>
            </button>
          ))}
        </div>
      </section>

      {cuenta.mesasUnidas.length > 0 && (
        <section className="grid gap-2" aria-labelledby="t-separar">
          <h3 id="t-separar" className="flex items-center gap-2 font-black">
            <Split size={18} aria-hidden /> Mesas juntadas
          </h3>
          <div className="flex flex-wrap gap-2">
            {cuenta.mesasUnidas.map((m) => (
              <button key={m.id} className="btn btn-blanco btn-sm" disabled={enviando} onClick={() => void hacer('separar', m, `La mesa ${m.numero} quedó libre`)}>
                Separar la mesa {m.numero}
              </button>
            ))}
          </div>
          <p className="text-xs text-tinta-soft">Al separarla, lo pedido sigue en esta cuenta.</p>
        </section>
      )}
    </div>
  )
}


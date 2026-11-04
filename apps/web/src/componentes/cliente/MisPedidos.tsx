'use client'

import { cop, fechaHora, type PedidoDTO } from '@rejana/shared'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'
import { api } from '@/lib/api'
import { credencialesInvitado } from '@/lib/pedidos-invitado'
import { useSesion } from '@/lib/sesion'
import { EstadoChip } from './EstadoChip'

export function MisPedidos() {
  const { usuario, cargando } = useSesion()
  const { data, isLoading, error } = useSWR<PedidoDTO[]>(cargando ? null : ['mis-pedidos', usuario?.id ?? 'invitado'], async () => {
    if (usuario) return (await api<{ pedidos: PedidoDTO[] }>('/mis-pedidos')).pedidos
    const credenciales = credencialesInvitado()
    if (credenciales.length === 0) return []
    const r = await api<{ pedidos: PedidoDTO[] }>('/pedidos/invitado', { metodo: 'POST', cuerpo: { credenciales: credenciales.map(({ id, token }) => ({ id, token })) } })
    return r.pedidos.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  })

  return (
    <div className="mx-auto max-w-2xl pt-6">
      <p className="acento text-lg">{usuario ? `Hola, ${usuario.nombre.split(' ')[0]}` : 'En este dispositivo'}</p>
      <h1 className="titulo text-3xl">Mis pedidos</h1>
      {!usuario && !cargando && (
        <p className="mt-3 text-sm text-noche-300">
          Como invitado ves los pedidos hechos desde este dispositivo.{' '}
          <Link href="/registro?volver=/mis-pedidos" className="font-bold text-amarillo underline">
            Crea una cuenta
          </Link>{' '}
          para tener tu historial en cualquier lugar.
        </p>
      )}
      {isLoading || cargando ? (
        <div className="mt-5 grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto h-24" />
          ))}
        </div>
      ) : error ? (
        <p className="mt-6 text-noche-300">No pudimos cargar tus pedidos. Revisa tu conexión.</p>
      ) : !data || data.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/sticker-clienta-fijo.webp" alt="" width={140} height={140} />
          <p className="font-bold">Todavía no tienes pedidos.</p>
          <Link href="/menu" className="btn btn-amarillo">
            Pedir ahora
          </Link>
        </div>
      ) : (
        <ul className="mt-5 grid gap-3">
          {data.map((p) => (
            <li key={p.id}>
              <Link href={`/pedido/${p.id}`} className="sticker flex items-center gap-3 p-4 text-tinta transition hover:-translate-y-0.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black">Pedido #{p.numero}</span>
                    <EstadoChip estado={p.estado} />
                  </div>
                  <p className="mt-1 truncate text-sm text-tinta-soft">{p.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', ')}</p>
                  <p className="mt-1 text-xs text-tinta-soft">
                    {fechaHora(p.creadoEn)} · Sede {p.sedeNombre} · <b className="text-tinta">{cop(p.total)}</b>
                  </p>
                </div>
                <ChevronRight className="shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

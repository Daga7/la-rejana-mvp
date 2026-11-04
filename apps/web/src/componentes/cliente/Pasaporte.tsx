'use client'

import { codigoPasaporteLegible, cop, fecha, type PasaporteClienteDTO, type ProgramaPasaporteDTO } from '@rejana/shared'
import { Gift, RefreshCw, Stamp } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { avisar } from '@/componentes/Avisos'
import { api, ErrorApi, obtener } from '@/lib/api'
import { useSesion } from '@/lib/sesion'

function Reglas({ programa }: { programa: ProgramaPasaporteDTO }) {
  return (
    <ul className="grid gap-1.5 text-sm">
      <li>
        <b>1.</b> Cada compra desde <b>{cop(programa.montoMinimo)}</b> te da un sello (en la mesa o a domicilio).
      </li>
      <li>
        <b>2.</b> Con <b>{programa.sellosParaPremio} sellos</b> ganas{' '}
        <b>{programa.premioNombre ? `${programa.premioNombre.toLowerCase()} gratis` : 'un premio'}</b>
        {programa.premioDescripcion ? ` (${programa.premioDescripcion})` : ''}.
      </li>
      <li>
        <b>3.</b> El premio se reclama en la caja del restaurante.
        {programa.vigenciaMeses > 0 && ` Cada sello dura ${programa.vigenciaMeses} meses.`}
      </li>
    </ul>
  )
}

/** Tarjeta de sellos: los círculos se llenan con cada compra. */
function Tarjeta({ sellos, total }: { sellos: number; total: number }) {
  const llenos = Math.min(sellos, total)
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="img" aria-label={`${llenos} de ${total} sellos`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`grid aspect-square place-items-center rounded-full border-2 ${i < llenos ? 'anim-rebote border-tinta bg-rosa-500 text-white' : 'border-dashed border-tinta/30 text-tinta/30'}`}>
          {i < llenos ? <Stamp size={22} aria-hidden /> : <span className="text-sm font-black">{i + 1}</span>}
        </span>
      ))}
    </div>
  )
}

export function PasaporteSellos() {
  const { usuario, cargando } = useSesion()
  const esCliente = usuario?.rol === 'cliente'
  const { data: publico } = useSWR<{ programa: ProgramaPasaporteDTO }>(!esCliente ? '/pasaporte/programa' : null, obtener)
  const { data, mutate } = useSWR<{ pasaporte: PasaporteClienteDTO }>(esCliente ? '/pasaporte' : null, obtener)
  const [acepto, setAcepto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const programa = data?.pasaporte.programa ?? publico?.programa

  async function accion(fn: () => Promise<unknown>, texto: string) {
    setEnviando(true)
    try {
      await fn()
      avisar(texto)
      await mutate()
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo completar la acción', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-5 pt-5">
      <div>
        <p className="acento text-lg">Fidelidad callejera</p>
        <h1 className="titulo text-4xl">Pasaporte de sellos</h1>
      </div>

      {cargando || !programa ? (
        <div className="esqueleto h-64" />
      ) : !programa.activo ? (
        <div className="sticker p-6 text-tinta">
          <p className="font-bold">El Pasaporte de sellos está en pausa por ahora.</p>
          <p className="mt-1 text-sm text-tinta-soft">Vuelve pronto: te avisamos cuando arranque.</p>
        </div>
      ) : !usuario ? (
        <div className="sticker grid gap-4 p-6 text-tinta">
          <Reglas programa={programa} />
          <p className="text-sm text-tinta-soft">El pasaporte es para clientes con cuenta: así guardamos tus sellos de forma segura.</p>
          <div className="flex flex-wrap gap-2">
            <Link prefetch={false} href="/registro?volver=/pasaporte" className="btn btn-rosa">
              Crear mi cuenta
            </Link>
            <Link prefetch={false} href="/ingresar?volver=/pasaporte" className="btn btn-blanco">
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      ) : !esCliente ? (
        <div className="sticker p-6 text-tinta">
          <p className="font-bold">El Pasaporte es para los clientes.</p>
          <p className="mt-1 text-sm text-tinta-soft">Desde la caja puedes dar sellos y canjear premios con el código del cliente.</p>
        </div>
      ) : !data ? (
        <div className="esqueleto h-64" />
      ) : !data.pasaporte.inscrito ? (
        <div className="sticker grid gap-4 p-6 text-tinta">
          <Reglas programa={programa} />
          <label className="flex items-start gap-3 rounded-2xl border-2 border-tinta/15 bg-white p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-rosa" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
            <span>
              Autorizo a La Rejana Callejera a registrar mis compras para darme sellos y premios del Pasaporte (fecha, sede y valor de cada compra), según el{' '}
              <Link prefetch={false} href="/privacidad" target="_blank" className="font-bold text-rosa-600 underline underline-offset-2">
                aviso de privacidad
              </Link>
              . En la caja solo verán mi nombre de pila y mis sellos. Puedo salir cuando quiera y se borran mis sellos.
            </span>
          </label>
          <button className="btn btn-rosa btn-lg" disabled={!acepto || enviando} onClick={() => void accion(() => api('/pasaporte/inscripcion', { metodo: 'POST', cuerpo: { acepto: true } }), '¡Tu pasaporte quedó activo!')}>
            <Stamp size={18} aria-hidden /> Activar mi pasaporte
          </button>
        </div>
      ) : (
        <>
          <section className="sticker grid gap-4 p-6 text-tinta" aria-labelledby="t-tarjeta">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="t-tarjeta" className="text-lg font-black">
                Tu tarjeta
              </h2>
              <span className="text-sm font-bold tabular-nums">
                {Math.min(data.pasaporte.sellosVigentes, programa.sellosParaPremio)} de {programa.sellosParaPremio} sellos
              </span>
            </div>
            <Tarjeta sellos={data.pasaporte.sellosVigentes} total={programa.sellosParaPremio} />
            {data.pasaporte.premiosDisponibles > 0 ? (
              <p className="flex items-center gap-2 rounded-2xl border-2 border-tinta bg-amarillo p-3 text-sm font-black">
                <Gift size={20} aria-hidden /> ¡Tienes {data.pasaporte.premiosDisponibles === 1 ? 'un premio' : `${data.pasaporte.premiosDisponibles} premios`}! Pídelo en la caja: {programa.premioNombre}.
              </p>
            ) : (
              <p className="text-sm text-tinta-soft">
                Te faltan {programa.sellosParaPremio - data.pasaporte.sellosVigentes} {programa.sellosParaPremio - data.pasaporte.sellosVigentes === 1 ? 'sello' : 'sellos'} para tu {programa.premioNombre?.toLowerCase() ?? 'premio'}.
              </p>
            )}
            {data.pasaporte.proximoVencimiento && <p className="text-xs text-tinta-soft">Tu sello más antiguo vence el {fecha(data.pasaporte.proximoVencimiento)}.</p>}
          </section>

          <section className="sticker grid gap-3 p-6 text-center text-tinta" aria-labelledby="t-codigo">
            <h2 id="t-codigo" className="text-lg font-black">
              Tu código
            </h2>
            <p className="font-mono text-4xl font-black tracking-widest tabular-nums" aria-label={`Código ${data.pasaporte.codigo?.split('').join(' ')}`}>
              {codigoPasaporteLegible(data.pasaporte.codigo ?? '')}
            </p>
            <p className="text-sm text-tinta-soft">Díselo a la caja cuando pagues en el restaurante. En tus pedidos a domicilio el sello llega solo.</p>
            <button
              className="btn btn-blanco btn-sm mx-auto"
              disabled={enviando}
              onClick={() => {
                if (window.confirm('¿Cambiar tu código? El anterior deja de servir.')) void accion(() => api('/pasaporte/codigo', { metodo: 'POST' }), 'Tu código cambió')
              }}
            >
              <RefreshCw size={16} aria-hidden /> Cambiar código
            </button>
          </section>

          <section className="sticker grid gap-3 p-6 text-tinta" aria-labelledby="t-reglas">
            <h2 id="t-reglas" className="text-lg font-black">
              Cómo funciona
            </h2>
            <Reglas programa={programa} />
          </section>

          {data.pasaporte.historial.length > 0 && (
            <section className="sticker grid gap-2 p-6 text-tinta" aria-labelledby="t-historial">
              <h2 id="t-historial" className="text-lg font-black">
                Tus movimientos
              </h2>
              <ul className="divide-y divide-crema-300 text-sm">
                {data.pasaporte.historial.map((h, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-tinta ${h.tipo === 'canje' ? 'bg-amarillo' : 'bg-rosa-500 text-white'}`}>{h.tipo === 'canje' ? <Gift size={16} aria-hidden /> : <Stamp size={16} aria-hidden />}</span>
                    <span className="flex-1">
                      <b className="block">{h.tipo === 'canje' ? h.detalle : `Sello · ${h.detalle}`}</b>
                      <span className="text-xs text-tinta-soft">
                        {fecha(h.fecha)} · {h.sedeNombre}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button
            className="btn btn-fantasma btn-sm mx-auto text-noche-300 underline"
            disabled={enviando}
            onClick={() => {
              if (window.confirm('¿Salir del Pasaporte? Se borran tus sellos y tu código, y no se pueden recuperar.')) void accion(() => api('/pasaporte', { metodo: 'DELETE' }), 'Saliste del Pasaporte y borramos tus sellos')
            }}
          >
            Salir del programa y borrar mis sellos
          </button>
        </>
      )}
    </div>
  )
}

'use client'

import { aceptarInvitacionSchema, INICIO_ROL, NOMBRE_ROL, fechaHora, type RolEmpleado, type UsuarioDTO } from '@rejana/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { avisar } from '@/componentes/Avisos'
import { BotonesOAuth } from '@/componentes/BotonesOAuth'
import { AlertaError, BotonEnviar, Campo, CampoClave, erroresDeApi, erroresDeZod, FortalezaClave, MensajeCampo, type Errores } from '@/componentes/Formulario'
import { Separador } from '@/componentes/PantallaAuth'
import { api, ErrorApi } from '@/lib/api'
import { useSesion } from '@/lib/sesion'

interface Invitacion {
  correo: string
  rol: RolEmpleado
  sedeNombre: string | null
  expiraEn: string
}

export function AceptarInvitacion() {
  const router = useRouter()
  const { establecer } = useSesion()
  const [token, setToken] = useState<string | null>(null)
  const [inv, setInv] = useState<Invitacion | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'invalida'>('cargando')
  const [datos, setDatos] = useState({ nombre: '', telefono: '', clave: '', aceptaPrivacidad: false })
  const [errores, setErrores] = useState<Errores>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    // El token viaja en el fragmento (#t=…): nunca llega a los servidores ni a los logs.
    const t = new URLSearchParams(window.location.hash.slice(1)).get('t')
    window.history.replaceState(null, '', window.location.pathname)
    if (!t) {
      queueMicrotask(() => setEstado('invalida'))
      return
    }
    api<{ invitacion: Invitacion }>('/invitaciones/consultar', { metodo: 'POST', cuerpo: { token: t } })
      .then((r) => {
        setToken(t)
        setInv(r.invitacion)
        setEstado('lista')
      })
      .catch(() => setEstado('invalida'))
  }, [])

  async function aceptar(ev: React.FormEvent) {
    ev.preventDefault()
    setGeneral(null)
    const r = aceptarInvitacionSchema.safeParse({ ...datos, telefono: datos.telefono || undefined })
    if (!r.success) return setErrores(erroresDeZod(r.error))
    setErrores({})
    setCargando(true)
    try {
      const { usuario } = await api<{ usuario: UsuarioDTO }>('/invitaciones/aceptar', { metodo: 'POST', cuerpo: { ...r.data, token } })
      establecer(usuario)
      avisar(`¡Listo, ${usuario.nombre.split(' ')[0]}! Ya eres parte del equipo`)
      router.replace(INICIO_ROL[usuario.rol])
    } catch (e) {
      if (e instanceof ErrorApi) {
        setErrores(e.codigo === 'CLAVE_DEBIL' ? { clave: e.message } : erroresDeApi(e.campos))
        if (e.codigo !== 'CLAVE_DEBIL') setGeneral(e.message)
      } else setGeneral('Algo salió mal. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  if (estado === 'cargando') {
    return (
      <div className="grid gap-3" aria-busy>
        <div className="esqueleto-claro h-6 w-2/3" />
        <div className="esqueleto-claro h-11" />
        <div className="esqueleto-claro h-11" />
      </div>
    )
  }
  if (estado === 'invalida' || !inv) {
    return (
      <div className="grid gap-4 text-center">
        <p className="font-bold">Esta invitación no es válida, ya se usó o venció.</p>
        <p className="text-sm text-tinta-soft">Pídele al administrador que te envíe una nueva. El enlace solo sirve una vez y por 72 horas.</p>
        <Link href="/" className="btn btn-crema">
          Ir al inicio
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl bg-amarillo-100 p-3 text-sm">
        Te invitaron como <b>{NOMBRE_ROL[inv.rol]}</b>
        {inv.sedeNombre ? (
          <>
            {' '}
            en la sede <b>{inv.sedeNombre}</b>
          </>
        ) : null}
        . Entrarás con <b className="break-all">{inv.correo}</b>. Vence: {fechaHora(inv.expiraEn)}.
      </div>
      <form onSubmit={aceptar} noValidate className="mt-4 grid gap-4">
        <AlertaError mensaje={general} />
        <Campo etiqueta="Tu nombre" autoComplete="name" value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} error={errores.nombre} required />
        <Campo etiqueta="Celular (opcional)" type="tel" autoComplete="tel" inputMode="tel" value={datos.telefono} onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} error={errores.telefono} />
        <div>
          <CampoClave etiqueta="Crea una contraseña" autoComplete="new-password" value={datos.clave} onChange={(e) => setDatos({ ...datos, clave: e.target.value })} error={errores.clave} required />
          <FortalezaClave clave={datos.clave} />
        </div>
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-rosa" checked={datos.aceptaPrivacidad} onChange={(e) => setDatos({ ...datos, aceptaPrivacidad: e.target.checked })} />
            <span>
              Autorizo el tratamiento de mis datos según el{' '}
              <Link href="/privacidad" target="_blank" className="font-bold text-rosa-600 underline">
                aviso de privacidad
              </Link>
              .
            </span>
          </label>
          <MensajeCampo error={errores.aceptaPrivacidad} />
        </div>
        <BotonEnviar cargando={cargando}>Crear mi acceso</BotonEnviar>
      </form>
      <Separador texto="o entra con este mismo correo" />
      {token && <BotonesOAuth invitacion={token} />}
    </>
  )
}

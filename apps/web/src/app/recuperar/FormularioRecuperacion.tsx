'use client'

import { correo as esquemaCorreo, claveNueva as esquemaClave, type UsuarioDTO } from '@rejana/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { avisar } from '@/componentes/Avisos'
import { BotonReenviar, CampoCodigo, useCuentaRegresiva } from '@/componentes/CampoCodigo'
import { AlertaError, BotonEnviar, Campo, CampoClave, FortalezaClave } from '@/componentes/Formulario'
import { api, ErrorApi } from '@/lib/api'
import { destinoTrasIngreso } from '@/lib/navegacion'
import { useSesion } from '@/lib/sesion'

export function FormularioRecuperacion() {
  const router = useRouter()
  const { establecer } = useSesion()
  const [paso, setPaso] = useState<'correo' | 'codigo'>('correo')
  const [correo, setCorreo] = useState('')
  const [codigo, setCodigo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCampo, setErrorCampo] = useState<string | undefined>()
  const [cargando, setCargando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const cuenta = useCuentaRegresiva(60)

  async function pedirCodigo(ev?: React.FormEvent) {
    ev?.preventDefault()
    setError(null)
    const r = esquemaCorreo.safeParse(correo)
    if (!r.success) return setErrorCampo(r.error.issues[0]?.message)
    setErrorCampo(undefined)
    setCargando(true)
    try {
      await api('/auth/recuperar-clave', { metodo: 'POST', cuerpo: { correo: r.data } })
      setPaso('codigo')
      cuenta.iniciar(setSegundos)
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No pudimos enviar el código')
    } finally {
      setCargando(false)
    }
  }

  async function restablecer(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)
    const c = esquemaClave.safeParse(clave)
    if (!c.success) return setErrorCampo(c.error.issues[0]?.message)
    setErrorCampo(undefined)
    setCargando(true)
    try {
      const { usuario } = await api<{ usuario: UsuarioDTO }>('/auth/restablecer-clave', { metodo: 'POST', cuerpo: { correo, codigo, claveNueva: clave } })
      establecer(usuario)
      avisar('Listo: tu contraseña cambió y cerramos tus otras sesiones')
      router.replace(destinoTrasIngreso(usuario.rol))
    } catch (e) {
      const ea = e instanceof ErrorApi ? e : null
      if (ea?.codigo === 'CLAVE_DEBIL') setErrorCampo(ea.message)
      else setError(ea?.message ?? 'No pudimos cambiar la contraseña')
    } finally {
      setCargando(false)
    }
  }

  if (paso === 'correo') {
    return (
      <form onSubmit={pedirCodigo} noValidate className="grid gap-4">
        <p className="text-sm text-tinta-soft">Escribe el correo de tu cuenta y te enviamos un código para crear una contraseña nueva.</p>
        <AlertaError mensaje={error} />
        <Campo etiqueta="Correo" type="email" autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} error={errorCampo} required />
        <BotonEnviar cargando={cargando}>Enviarme el código</BotonEnviar>
      </form>
    )
  }

  return (
    <form onSubmit={restablecer} noValidate className="grid gap-4">
      <p className="rounded-xl bg-turquesa-100 p-3 text-sm">
        Si <b className="break-all">{correo}</b> tiene cuenta, te llegó un código de 6 dígitos (vence en 10 minutos).
      </p>
      <AlertaError mensaje={error} />
      <CampoCodigo valor={codigo} onCambio={setCodigo} />
      <div>
        <CampoClave etiqueta="Contraseña nueva" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} error={errorCampo} required />
        <FortalezaClave clave={clave} />
      </div>
      <BotonEnviar cargando={cargando} disabled={codigo.length !== 6}>
        Cambiar contraseña
      </BotonEnviar>
      <BotonReenviar segundos={segundos} onReenviar={() => void pedirCodigo()} cargando={cargando} />
    </form>
  )
}

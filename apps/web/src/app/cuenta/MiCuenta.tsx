'use client'

import { actualizarPerfilSchema, cambiarClaveSchema, INICIO_ROL, NOMBRE_ROL, telefonoLegible } from '@rejana/shared'
import { ArrowLeft, KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { avisar } from '@/componentes/Avisos'
import { AlertaError, BotonEnviar, Campo, CampoClave, erroresDeZod, FortalezaClave, type Errores } from '@/componentes/Formulario'
import { api, ErrorApi } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import type { UsuarioDTO } from '@rejana/shared'

export function MiCuenta() {
  const { usuario, establecer, salir } = useSesion()
  const router = useRouter()
  if (!usuario) return null
  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={INICIO_ROL[usuario.rol]} className="btn btn-fantasma btn-sm -ml-3 text-noche-300">
          <ArrowLeft size={16} aria-hidden /> Volver
        </Link>
        <button
          className="btn btn-blanco btn-sm"
          onClick={async () => {
            await salir()
            avisar('Cerraste sesión')
            router.replace('/')
          }}
        >
          <LogOut size={16} aria-hidden /> Cerrar sesión
        </button>
      </div>
      <div>
        <p className="acento text-lg">{NOMBRE_ROL[usuario.rol]}</p>
        <h1 className="titulo text-3xl">Mi cuenta</h1>
      </div>
      <Perfil usuario={usuario} alGuardar={establecer} />
      <Seguridad usuario={usuario} />
      <p className="text-center text-xs text-noche-300">
        Tus datos se tratan según el{' '}
        <Link href="/privacidad" className="underline">
          aviso de privacidad
        </Link>
        . Para conocerlos, corregirlos o borrarlos escribe a privacidad@larejana.co.
      </p>
    </div>
  )
}

function Perfil({ usuario, alGuardar }: { usuario: UsuarioDTO; alGuardar: (u: UsuarioDTO) => void }) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [telefono, setTelefono] = useState(usuario.telefono ? telefonoLegible(usuario.telefono) : '')
  const [errores, setErrores] = useState<Errores>({})
  const [cargando, setCargando] = useState(false)

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault()
    const r = actualizarPerfilSchema.safeParse({ nombre, telefono: telefono.trim() ? telefono : null })
    if (!r.success) return setErrores(erroresDeZod(r.error))
    setErrores({})
    setCargando(true)
    try {
      const { usuario: u } = await api<{ usuario: UsuarioDTO }>('/cuenta', { metodo: 'PATCH', cuerpo: r.data })
      alGuardar(u)
      avisar('Datos guardados')
    } catch (e) {
      avisar(e instanceof ErrorApi ? e.message : 'No se pudo guardar', 'error')
    } finally {
      setCargando(false)
    }
  }

  return (
    <section className="sticker p-5 text-tinta" aria-labelledby="t-perfil">
      <h2 id="t-perfil" className="flex items-center gap-2 text-lg font-extrabold">
        <UserRound size={20} aria-hidden /> Tus datos
      </h2>
      <form onSubmit={guardar} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} autoComplete="name" />
        <Campo etiqueta="Celular" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} error={errores.telefono} autoComplete="tel" placeholder="300 123 4567" />
        <Campo etiqueta="Correo" value={usuario.correo} disabled className="sm:col-span-2" ayuda={usuario.proveedores.length ? `Vinculado con ${usuario.proveedores.map((p) => (p === 'google' ? 'Google' : 'Apple')).join(' y ')}` : undefined} />
        <div className="sm:col-span-2">
          <BotonEnviar cargando={cargando} className="btn-turquesa">
            Guardar cambios
          </BotonEnviar>
        </div>
      </form>
    </section>
  )
}

function Seguridad({ usuario }: { usuario: UsuarioDTO }) {
  const [claveActual, setClaveActual] = useState('')
  const [claveNueva, setClaveNueva] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  if (!usuario.tieneClave) {
    return (
      <section className="sticker p-5 text-tinta">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <ShieldCheck size={20} aria-hidden /> Seguridad
        </h2>
        <p className="mt-2 text-sm">
          Entras con {usuario.proveedores.includes('apple') ? 'Apple' : 'Google'}. Si quieres también una contraseña, usa{' '}
          <Link href="/recuperar" className="font-bold text-rosa-600 underline">
            «Olvidé mi contraseña»
          </Link>{' '}
          con tu correo.
        </p>
      </section>
    )
  }

  async function cambiar(ev: React.FormEvent) {
    ev.preventDefault()
    setGeneral(null)
    const r = cambiarClaveSchema.safeParse({ claveActual, claveNueva })
    if (!r.success) return setErrores(erroresDeZod(r.error))
    setErrores({})
    setCargando(true)
    try {
      await api('/auth/cambiar-clave', { metodo: 'POST', cuerpo: r.data })
      setClaveActual('')
      setClaveNueva('')
      avisar('Contraseña cambiada. Cerramos tus sesiones en otros dispositivos.')
    } catch (e) {
      if (e instanceof ErrorApi) {
        const campo = typeof e.detalles?.campo === 'string' ? e.detalles.campo : e.codigo === 'CLAVE_DEBIL' ? 'claveNueva' : null
        if (campo) setErrores({ [campo]: e.message })
        else setGeneral(e.message)
      } else setGeneral('No se pudo cambiar la contraseña')
    } finally {
      setCargando(false)
    }
  }

  return (
    <section className="sticker p-5 text-tinta" aria-labelledby="t-seg">
      <h2 id="t-seg" className="flex items-center gap-2 text-lg font-extrabold">
        <KeyRound size={20} aria-hidden /> Cambiar contraseña
      </h2>
      <form onSubmit={cambiar} className="mt-4 grid gap-4" noValidate>
        <AlertaError mensaje={general} />
        <CampoClave etiqueta="Contraseña actual" autoComplete="current-password" value={claveActual} onChange={(e) => setClaveActual(e.target.value)} error={errores.claveActual} />
        <div>
          <CampoClave etiqueta="Contraseña nueva" autoComplete="new-password" value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} error={errores.claveNueva} />
          <FortalezaClave clave={claveNueva} />
        </div>
        <BotonEnviar cargando={cargando} className="btn-noche">
          Cambiar contraseña
        </BotonEnviar>
        <p className="text-xs text-tinta-soft">Por seguridad, al cambiarla cerramos tu sesión en los demás dispositivos.</p>
      </form>
    </section>
  )
}

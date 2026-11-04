'use client'

import { ingresarSchema, type UsuarioDTO } from '@rejana/shared'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { BotonesOAuth, hayOAuth } from '@/componentes/BotonesOAuth'
import { AlertaError, BotonEnviar, Campo, CampoClave, erroresDeApi, erroresDeZod, type Errores } from '@/componentes/Formulario'
import { Separador } from '@/componentes/PantallaAuth'
import { api, ErrorApi } from '@/lib/api'
import type { ProveedoresOAuth } from '@/lib/api-servidor'
import { destinoTrasIngreso, MENSAJES_ERROR_OAUTH, rutaInterna } from '@/lib/navegacion'
import { useSesion } from '@/lib/sesion'

export function FormularioIngreso({ proveedores }: { proveedores: ProveedoresOAuth }) {
  const router = useRouter()
  const params = useSearchParams()
  const volver = rutaInterna(params.get('volver'))
  const errorOAuth = params.get('error')
  const { establecer } = useSesion()
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [general, setGeneral] = useState<string | null>(errorOAuth ? (MENSAJES_ERROR_OAUTH[errorOAuth] ?? 'No pudimos iniciar tu sesión. Inténtalo de nuevo.') : null)
  const [cargando, setCargando] = useState(false)

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    setGeneral(null)
    const r = ingresarSchema.safeParse({ correo, clave })
    if (!r.success) return setErrores(erroresDeZod(r.error))
    setErrores({})
    setCargando(true)
    try {
      const { usuario } = await api<{ usuario: UsuarioDTO }>('/auth/ingresar', { metodo: 'POST', cuerpo: r.data })
      establecer(usuario)
      router.replace(destinoTrasIngreso(usuario.rol, volver))
    } catch (e) {
      if (e instanceof ErrorApi) {
        setErrores(erroresDeApi(e.campos))
        setGeneral(e.message)
      } else setGeneral('Algo salió mal. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <AlertaError mensaje={general} />
        <Campo etiqueta="Correo" type="email" name="correo" autoComplete="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} error={errores.correo} required />
        <CampoClave etiqueta="Contraseña" name="clave" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} error={errores.clave} required />
        <div className="-mt-1 text-right">
          <Link prefetch={false} href="/recuperar" className="text-sm font-semibold text-rosa-600 underline-offset-4 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <BotonEnviar cargando={cargando}>Entrar</BotonEnviar>
      </form>
      {hayOAuth(proveedores) && (
        <>
          <Separador />
          <BotonesOAuth proveedores={proveedores} volver={volver ?? undefined} />
        </>
      )}
      <p className="mt-5 text-center text-sm">
        ¿No tienes cuenta?{' '}
        <Link prefetch={false} href={`/registro${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`} className="font-bold text-rosa-600 underline underline-offset-4">
          Regístrate
        </Link>{' '}
        o{' '}
        <Link prefetch={false} href="/menu" className="font-bold underline underline-offset-4">
          pide como invitado
        </Link>
      </p>
    </>
  )
}

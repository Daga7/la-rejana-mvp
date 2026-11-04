'use client'

import { registroSchema } from '@rejana/shared'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { BotonesOAuth } from '@/componentes/BotonesOAuth'
import { AlertaError, BotonEnviar, Campo, CampoClave, erroresDeApi, erroresDeZod, FortalezaClave, MensajeCampo, type Errores } from '@/componentes/Formulario'
import { Separador } from '@/componentes/PantallaAuth'
import { api, ErrorApi } from '@/lib/api'
import { rutaInterna } from '@/lib/navegacion'

export function FormularioRegistro() {
  const router = useRouter()
  const volver = rutaInterna(useSearchParams().get('volver'))
  const [datos, setDatos] = useState({ nombre: '', correo: '', clave: '', aceptaPrivacidad: false })
  const [errores, setErrores] = useState<Errores>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const cambiar = (campo: keyof typeof datos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDatos((d) => ({ ...d, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    setGeneral(null)
    const r = registroSchema.safeParse(datos)
    if (!r.success) return setErrores(erroresDeZod(r.error))
    setErrores({})
    setCargando(true)
    try {
      await api('/auth/registro', { metodo: 'POST', cuerpo: r.data })
      const q = new URLSearchParams({ correo: r.data.correo })
      if (volver) q.set('volver', volver)
      router.push(`/verificar?${q}`)
    } catch (e) {
      if (e instanceof ErrorApi) {
        setErrores(erroresDeApi(e.campos))
        if (e.codigo === 'CLAVE_DEBIL') setErrores({ clave: e.message })
        else setGeneral(e.message)
      } else setGeneral('Algo salió mal. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <AlertaError mensaje={general} />
        <Campo etiqueta="Nombre" name="nombre" autoComplete="name" value={datos.nombre} onChange={cambiar('nombre')} error={errores.nombre} required />
        <Campo etiqueta="Correo" type="email" name="correo" autoComplete="email" inputMode="email" value={datos.correo} onChange={cambiar('correo')} error={errores.correo} ayuda="Te enviaremos un código de 6 dígitos para confirmarlo." required />
        <div>
          <CampoClave etiqueta="Contraseña" name="clave" autoComplete="new-password" value={datos.clave} onChange={cambiar('clave')} error={errores.clave} required minLength={8} />
          <FortalezaClave clave={datos.clave} />
        </div>
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-rosa" checked={datos.aceptaPrivacidad} onChange={cambiar('aceptaPrivacidad')} aria-invalid={!!errores.aceptaPrivacidad} />
            <span>
              Autorizo el tratamiento de mis datos según el{' '}
              <Link prefetch={false} href="/privacidad" target="_blank" className="font-bold text-rosa-600 underline underline-offset-2">
                aviso de privacidad
              </Link>{' '}
              (Ley 1581 de 2012).
            </span>
          </label>
          <MensajeCampo error={errores.aceptaPrivacidad} />
        </div>
        <BotonEnviar cargando={cargando}>Crear cuenta</BotonEnviar>
      </form>
      <Separador />
      <BotonesOAuth volver={volver ?? undefined} texto="Registrarme con" />
      <p className="mt-3 text-center text-xs text-tinta-soft">
        Al continuar con Google o Apple aceptas el{' '}
        <Link prefetch={false} href="/privacidad" className="underline">
          aviso de privacidad
        </Link>
        .
      </p>
      <p className="mt-4 text-center text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link prefetch={false} href="/ingresar" className="font-bold text-rosa-600 underline underline-offset-4">
          Inicia sesión
        </Link>
      </p>
    </>
  )
}

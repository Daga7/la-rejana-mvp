'use client'

import type { UsuarioDTO } from '@rejana/shared'
import { MailCheck } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { avisar } from '@/componentes/Avisos'
import { BotonReenviar, CampoCodigo, useCuentaRegresiva } from '@/componentes/CampoCodigo'
import { AlertaError, BotonEnviar } from '@/componentes/Formulario'
import { api, ErrorApi } from '@/lib/api'
import { rutaInterna } from '@/lib/navegacion'
import { useSesion } from '@/lib/sesion'

export function FormularioVerificacion() {
  const router = useRouter()
  const params = useSearchParams()
  const correo = params.get('correo') ?? ''
  const volver = rutaInterna(params.get('volver'))
  const { establecer } = useSesion()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [segundos, setSegundos] = useState(60)
  const cuenta = useCuentaRegresiva(60)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => cuenta.iniciar(setSegundos), [])

  async function verificar(valor = codigo) {
    if (valor.length !== 6 || cargando) return
    setError(null)
    setCargando(true)
    try {
      const { usuario } = await api<{ usuario: UsuarioDTO }>('/auth/verificar-correo', { metodo: 'POST', cuerpo: { correo, codigo: valor } })
      establecer(usuario)
      avisar(`¡Bienvenido, ${usuario.nombre.split(' ')[0]}! Tu cuenta quedó lista`)
      router.replace(volver ?? '/menu')
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No pudimos verificar el código. Inténtalo de nuevo.')
      setCodigo('')
    } finally {
      setCargando(false)
    }
  }

  async function reenviar() {
    setReenviando(true)
    setError(null)
    try {
      await api('/auth/reenviar-codigo', { metodo: 'POST', cuerpo: { correo } })
      avisar('Te enviamos un código nuevo', 'info')
      cuenta.iniciar(setSegundos)
    } catch (e) {
      const ea = e instanceof ErrorApi ? e : null
      setError(ea?.message ?? 'No pudimos reenviar el código')
      if (ea?.codigo === 'ESPERA_REENVIO' && typeof ea.detalles?.segundos === 'number') cuenta.iniciar(setSegundos, ea.detalles.segundos)
    } finally {
      setReenviando(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void verificar()
      }}
      className="grid gap-4"
    >
      <div className="flex items-start gap-3 rounded-xl bg-turquesa-100 p-3 text-sm">
        <MailCheck className="mt-0.5 shrink-0 text-turquesa-600" size={20} aria-hidden />
        <p>
          Enviamos un código a <b className="break-all">{correo || 'tu correo'}</b>. Vence en 10 minutos. Si no lo ves, revisa la carpeta de spam.
        </p>
      </div>
      <AlertaError mensaje={error} />
      <CampoCodigo valor={codigo} onCambio={setCodigo} onCompleto={(v) => void verificar(v)} deshabilitado={cargando} />
      <BotonEnviar cargando={cargando} disabled={codigo.length !== 6}>
        Verificar y entrar
      </BotonEnviar>
      <BotonReenviar segundos={segundos} onReenviar={reenviar} cargando={reenviando} />
    </form>
  )
}

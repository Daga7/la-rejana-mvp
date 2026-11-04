import { createHash } from 'node:crypto'
import {
  aceptarInvitacionSchema,
  actualizarPerfilSchema,
  cambiarClaveSchema,
  id,
  ingresarSchema,
  invitacionSchema,
  PROVEEDORES_OAUTH,
  recuperarClaveSchema,
  reenviarCodigoSchema,
  registroSchema,
  restablecerClaveSchema,
  verificarCorreoSchema,
  type ProveedorOAuth,
} from '@rejana/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { SesionEmitida } from '../../../application/auth'
import { escaparHtml } from '../../../application/correos'
import type { Contenedor } from '../../../contenedor'
import { ErrorDominio, err } from '../../../domain/errores'
import { borrarSesion, leerCookie, nombresCookies, ponerSesion } from '../cookies'
import { actorDe } from '../servidor'

const esquemaToken = z.object({ token: z.string().min(20).max(200) })
const esquemaProveedor = z.object({ proveedor: z.enum(PROVEEDORES_OAUTH) })

export function rutasAuth(app: FastifyInstance, c: Contenedor) {
  const env = c.env
  const n = nombresCookies(env.COOKIE_SECURE)
  const pista = env.COOKIE_SECURE ? '__Host-rj_hay_sesion' : 'rj_hay_sesion'
  const registro = env.COOKIE_SECURE ? '__Host-rj_reg' : 'rj_reg'
  const cfg = { seguras: env.COOKIE_SECURE }
  const auth = c.casos.auth
  const ctx = (req: FastifyRequest) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })
  const limite = (max: number, ventana: string) => ({ rateLimit: { max, timeWindow: ventana } })

  function emitir(reply: FastifyReply, s: Pick<SesionEmitida, 'acceso' | 'refresco' | 'expiraRefresco'>) {
    ponerSesion(reply, cfg, s.acceso, s.refresco, s.expiraRefresco)
    // Pista NO sensible para que la web sepa si vale la pena consultar /auth/yo.
    reply.setCookie(pista, '1', { httpOnly: false, secure: cfg.seguras, sameSite: 'strict', path: '/', expires: s.expiraRefresco })
  }
  function limpiar(reply: FastifyReply) {
    borrarSesion(reply, cfg)
    reply.clearCookie(pista, { path: '/', secure: cfg.seguras, sameSite: 'strict' })
  }
  const destinoWeb = (ruta: string) => new URL(ruta, env.WEB_ORIGIN).href

  // --- CSRF -------------------------------------------------------------------------------------
  app.get('/api/auth/csrf', { config: limite(120, '1 minute') }, async (req, reply) => {
    let token = leerCookie(req, n.csrf)
    if (!token) {
      token = c.cripto.tokenAleatorio(24)
      reply.setCookie(n.csrf, token, { httpOnly: true, secure: cfg.seguras, sameSite: 'strict', path: '/' })
    }
    reply.header('Cache-Control', 'no-store')
    return { token }
  })

  // --- Registro con código -----------------------------------------------------------------------
  app.post('/api/auth/registro', { config: limite(5, '10 minutes') }, async (req, reply) => {
    const datos = registroSchema.parse(req.body)
    let vinculo = leerCookie(req, registro)
    if (!vinculo || vinculo.length < 30) {
      vinculo = c.cripto.tokenAleatorio(24)
      reply.setCookie(registro, vinculo, { httpOnly: true, secure: cfg.seguras, sameSite: 'strict', path: '/', maxAge: 24 * 3600 })
    }
    await auth.registrar(datos, { ...ctx(req), vinculo })
    return reply.status(202).send({ mensaje: 'Si el correo es válido, te enviamos un código de 6 dígitos. Revisa también la carpeta de spam.' })
  })

  app.post('/api/auth/reenviar-codigo', { config: limite(5, '10 minutes') }, async (req, reply) => {
    const datos = reenviarCodigoSchema.parse(req.body)
    await auth.reenviarCodigo(datos, { vinculo: leerCookie(req, registro) ?? null })
    return reply.status(202).send({ mensaje: 'Si hay un registro pendiente, te enviamos un código nuevo.' })
  })

  app.post('/api/auth/verificar-correo', { config: limite(10, '1 minute') }, async (req, reply) => {
    const datos = verificarCorreoSchema.parse(req.body)
    const s = await auth.verificarCorreo(datos, { ...ctx(req), vinculo: leerCookie(req, registro) ?? null })
    emitir(reply, s)
    reply.clearCookie(registro, { path: '/', secure: cfg.seguras, sameSite: 'strict', httpOnly: true })
    return { usuario: s.usuario }
  })

  // --- Sesión ------------------------------------------------------------------------------------
  // En producción el límite es fijo (10 por minuto e IP); en desarrollo se puede subir para las pruebas e2e.
  const ingresosPorMinuto = c.env.NODE_ENV === 'production' ? 10 : c.env.LIMITE_INGRESOS_POR_MINUTO
  app.post('/api/auth/ingresar', { config: limite(ingresosPorMinuto, '1 minute') }, async (req, reply) => {
    const datos = ingresarSchema.parse(req.body)
    const s = await auth.ingresar(datos, ctx(req))
    emitir(reply, s)
    return { usuario: s.usuario }
  })

  app.post('/api/auth/refrescar', { config: limite(30, '1 minute') }, async (req, reply) => {
    try {
      const s = await auth.refrescar(leerCookie(req, n.refresco))
      emitir(reply, s)
      return reply.status(204).send()
    } catch (e) {
      limpiar(reply)
      throw e
    }
  })

  app.post('/api/auth/salir', async (req, reply) => {
    await auth.salir(await actorDe(req, c, env), leerCookie(req, n.refresco))
    limpiar(reply)
    return reply.status(204).send()
  })

  app.get('/api/auth/yo', async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    return { usuario: await auth.yo(await actorDe(req, c, env)) }
  })

  app.patch('/api/cuenta', async (req) => {
    const datos = actualizarPerfilSchema.parse(req.body)
    return { usuario: await auth.actualizarPerfil(await actorDe(req, c, env), datos) }
  })

  app.post('/api/auth/cambiar-clave', { config: limite(5, '10 minutes') }, async (req, reply) => {
    const datos = cambiarClaveSchema.parse(req.body)
    await auth.cambiarClave(await actorDe(req, c, env), datos)
    return reply.status(204).send()
  })

  app.post('/api/auth/recuperar-clave', { config: limite(5, '10 minutes') }, async (req, reply) => {
    const datos = recuperarClaveSchema.parse(req.body)
    await auth.solicitarRecuperacion(datos)
    return reply.status(202).send({ mensaje: 'Si existe una cuenta con ese correo, te enviamos un código para crear una contraseña nueva.' })
  })

  app.post('/api/auth/restablecer-clave', { config: limite(10, '10 minutes') }, async (req, reply) => {
    const datos = restablecerClaveSchema.parse(req.body)
    const s = await auth.restablecerClave(datos, ctx(req))
    emitir(reply, s)
    return { usuario: s.usuario }
  })

  // --- Google / Apple ------------------------------------------------------------------------------
  app.get('/api/auth/proveedores', async () => ({ google: auth.proveedorDisponible('google'), apple: auth.proveedorDisponible('apple') }))

  app.get('/api/auth/oauth/:proveedor', { config: limite(20, '1 minute') }, async (req, reply) => {
    const { proveedor } = esquemaProveedor.parse(req.params)
    const q = z.object({ invitacion: z.string().max(200).optional(), volver: z.string().max(200).optional() }).parse(req.query)
    try {
      const { url, estado } = await auth.iniciarOAuth(proveedor, q)
      // Apple responde con un POST entre sitios (form_post): su cookie necesita SameSite=None.
      const sameSite = proveedor === 'apple' && cfg.seguras ? 'none' : 'lax'
      reply.setCookie(n.oauth, estado, { httpOnly: true, secure: cfg.seguras, sameSite, path: '/', maxAge: 600 })
      return reply.redirect(url, 302)
    } catch (e) {
      const codigo = e instanceof ErrorDominio ? e.codigo : 'ERROR'
      return reply.redirect(destinoWeb(`/ingresar?error=${codigo}`), 302)
    }
  })

  async function callback(req: FastifyRequest, reply: FastifyReply) {
    const { proveedor } = esquemaProveedor.parse(req.params)
    const fuente = (req.method === 'POST' ? req.body : req.query) as Record<string, string | undefined>
    const datos = { code: fuente.code?.slice(0, 2048), state: fuente.state?.slice(0, 200), usuarioApple: fuente.user?.slice(0, 2000) ?? null, error: fuente.error?.slice(0, 100) }
    const estado = leerCookie(req, n.oauth)
    reply.clearCookie(n.oauth, { path: '/', secure: cfg.seguras })
    try {
      const { sesion, destino } = await auth.completarOAuth(proveedor, datos, estado, ctx(req))
      emitir(reply, sesion)
      return reply.redirect(destinoWeb(destino), 302)
    } catch (e) {
      req.log.warn({ proveedor, codigo: e instanceof ErrorDominio ? e.codigo : 'ERROR' }, 'Fallo en el inicio de sesión externo')
      const codigo = e instanceof ErrorDominio ? e.codigo : 'ERROR'
      return reply.redirect(destinoWeb(`/ingresar?error=${codigo}`), 302)
    }
  }
  app.get('/api/auth/oauth/:proveedor/callback', { config: limite(20, '1 minute') }, callback)
  // Apple devuelve un formulario POST desde appleid.apple.com: lo protege el "state" firmado, no el token CSRF.
  app.post('/api/auth/oauth/:proveedor/callback', { config: { ...limite(20, '1 minute'), csrf: false } }, callback)

  // Pantalla del proveedor simulado (solo desarrollo, OAUTH_MOCK=true).
  if (c.firmarCodigoSimulado) {
    const firmar = c.firmarCodigoSimulado
    const parametros = z.object({ proveedor: z.enum(PROVEEDORES_OAUTH), state: z.string().max(200), nonce: z.string().max(200), redirect_uri: z.string().max(300) })
    const validarRetorno = (uri: string) => {
      if (!uri.startsWith(`${new URL(env.WEB_ORIGIN).origin}/api/auth/oauth/`)) throw err.validacion('redirect_uri no permitido')
    }
    app.get('/api/auth/oauth/simulado/autorizar', async (req, reply) => {
      const p = parametros.parse(req.query)
      validarRetorno(p.redirect_uri)
      const nombre = p.proveedor === 'google' ? 'Google' : 'Apple'
      const ocultos = Object.entries(p)
        .map(([k, v]) => `<input type="hidden" name="${escaparHtml(k)}" value="${escaparHtml(v)}">`)
        .join('')
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
      reply.type('text/html; charset=utf-8')
      return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${nombre} (simulado)</title>
<body style="font-family:system-ui;background:#f3f4f6;display:grid;place-items:center;min-height:100vh;margin:0">
<form method="get" action="/api/auth/oauth/simulado/aprobar" style="background:#fff;padding:28px;border-radius:16px;box-shadow:0 8px 30px #0002;width:min(92vw,360px)">
<p style="margin:0;color:#b45309;font-weight:700;font-size:13px">⚠ PROVEEDOR SIMULADO · SOLO DESARROLLO</p>
<h1 style="font-size:20px">Continuar con ${nombre}</h1>${ocultos}
<label style="display:block;font-size:13px;margin-top:12px">Correo<input name="email" type="email" required value="cliente.google@larejana.test" style="display:block;width:100%;padding:10px;margin-top:4px;box-sizing:border-box"></label>
<label style="display:block;font-size:13px;margin-top:12px">Nombre<input name="nombre" required value="Persona de Prueba" style="display:block;width:100%;padding:10px;margin-top:4px;box-sizing:border-box"></label>
<button style="margin-top:18px;width:100%;padding:12px;border:0;border-radius:999px;background:#1a73e8;color:#fff;font-weight:700">Continuar</button>
</form></body></html>`
    })
    app.get('/api/auth/oauth/simulado/aprobar', async (req, reply) => {
      const p = parametros.extend({ email: z.email().max(254), nombre: z.string().min(1).max(80) }).parse(req.query)
      validarRetorno(p.redirect_uri)
      const sujeto = `sim-${createHash('sha256').update(`${p.proveedor}:${p.email.toLowerCase()}`).digest('hex').slice(0, 24)}`
      const code = await firmar({ proveedor: p.proveedor, sujeto, email: p.email.toLowerCase(), emailVerificado: true, nombre: p.nombre, nonce: p.nonce })
      return reply.redirect(`${p.redirect_uri}?${new URLSearchParams({ code, state: p.state })}`, 302)
    })
  }

  // --- Invitaciones -----------------------------------------------------------------------------------
  app.post('/api/invitaciones/consultar', { config: limite(20, '1 minute') }, async (req) => {
    const { token } = esquemaToken.parse(req.body)
    return { invitacion: await auth.consultarInvitacion(token) }
  })

  app.post('/api/invitaciones/aceptar', { config: limite(10, '10 minutes') }, async (req, reply) => {
    const { token } = esquemaToken.parse(req.body)
    const datos = aceptarInvitacionSchema.parse(req.body)
    const s = await auth.aceptarInvitacion(token, datos, ctx(req))
    emitir(reply, s)
    return { usuario: s.usuario }
  })

  app.get('/api/admin/invitaciones', async (req) => ({ invitaciones: await auth.listarInvitaciones(await actorDe(req, c, env)) }))

  app.post('/api/admin/invitaciones', { config: limite(30, '10 minutes') }, async (req, reply) => {
    const datos = invitacionSchema.parse(req.body)
    const inv = await auth.invitar(await actorDe(req, c, env), datos, ctx(req))
    return reply.status(201).send({ invitacion: inv })
  })

  app.delete('/api/admin/invitaciones/:id', async (req, reply) => {
    const { id: invitacionId } = z.object({ id }).parse(req.params)
    await auth.revocarInvitacion(await actorDe(req, c, env), invitacionId, ctx(req))
    return reply.status(204).send()
  })
}

export type { ProveedorOAuth }
